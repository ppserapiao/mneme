import type { MemoryId, MemoryLifecycle, MemoryRecord, OwnerId } from '@mnemehq/protocol'
import { type SupersedeContext, lifecycleEquals, mergeLifecycle } from './lifecycle-merge'
import type { SyncCatalog, SyncCatalogEntry, SyncPeer } from './peer'

/**
 * Minimal store surface the sync engine needs. The full `SqliteStore`
 * implements this; tests can pass any adapter.
 */
export interface SyncableStore {
  catalog(ownerId: OwnerId): Promise<SyncCatalog>
  fetchById(ownerId: OwnerId, ids: ReadonlyArray<MemoryId>): Promise<ReadonlyArray<MemoryRecord>>
  upsertForSync(ownerId: OwnerId, records: ReadonlyArray<MemoryRecord>): Promise<void>
  applyLifecycleUpdate(ownerId: OwnerId, id: MemoryId, lifecycle: MemoryLifecycle): Promise<void>
}

export type SyncResult = {
  /** Records sent to the peer that it did not have. */
  pushed: number
  /** Records received from the peer that we did not have. */
  pulled: number
  /** Records present on both sides whose lifecycle envelopes differed and were merged. */
  merged: number
}

/**
 * Bidirectional sync between a local `SyncableStore` and a `SyncPeer`,
 * scoped to a single owner.
 *
 * Algorithm (ADR 0008 §1, §2, §6):
 *   1. Get local and remote catalogs.
 *   2. Diff by `id`:
 *      - local-only ids → push full records to peer
 *      - remote-only ids → fetch from peer, upsert locally
 *      - both-sides ids → merge lifecycle (push update if local changed,
 *        apply update locally if remote changed)
 *   3. Return a summary.
 *
 * No record body is ever mutated. Lifecycle merge is deterministic per
 * `mergeLifecycle`, so re-running sync converges in one step.
 */
export async function syncOnce(
  store: SyncableStore,
  peer: SyncPeer,
  ownerId: OwnerId,
): Promise<SyncResult> {
  const [localCatalog, remoteCatalog] = await Promise.all([
    store.catalog(ownerId),
    peer.catalog(ownerId),
  ])

  const localById = catalogIndex(localCatalog)
  const remoteById = catalogIndex(remoteCatalog)

  const localOnly: MemoryId[] = []
  const remoteOnly: MemoryId[] = []
  const onBoth: MemoryId[] = []

  for (const [id, entry] of localById) {
    if (remoteById.has(id)) onBoth.push(entry.id)
    else localOnly.push(entry.id)
  }
  for (const [id, entry] of remoteById) {
    if (!localById.has(id)) remoteOnly.push(entry.id)
  }

  // Build a SupersedeContext that knows the createdAt of every record either
  // side claims to have. Used by mergeLifecycle to pick the supersededBy winner.
  const ctx = makeSupersedeContext(localById, remoteById)

  // Fan out the three diff actions in parallel where order doesn't matter.
  const [pushed, pulled] = await Promise.all([
    pushLocalOnly(store, peer, ownerId, localOnly),
    pullRemoteOnly(store, peer, ownerId, remoteOnly),
  ])

  const merged = await reconcileLifecycle(store, peer, ownerId, onBoth, localById, remoteById, ctx)

  return { pushed, pulled, merged }
}

function catalogIndex(catalog: SyncCatalog): Map<string, SyncCatalogEntry> {
  const m = new Map<string, SyncCatalogEntry>()
  for (const entry of catalog.entries) m.set(entry.id, entry)
  return m
}

function makeSupersedeContext(
  local: Map<string, SyncCatalogEntry>,
  remote: Map<string, SyncCatalogEntry>,
): SupersedeContext {
  return {
    createdAtOf(id: string): string | undefined {
      return local.get(id)?.createdAt ?? remote.get(id)?.createdAt
    },
  }
}

async function pushLocalOnly(
  store: SyncableStore,
  peer: SyncPeer,
  ownerId: OwnerId,
  ids: ReadonlyArray<MemoryId>,
): Promise<number> {
  if (ids.length === 0) return 0
  const records = await store.fetchById(ownerId, ids)
  await peer.push(ownerId, records)
  return records.length
}

async function pullRemoteOnly(
  store: SyncableStore,
  peer: SyncPeer,
  ownerId: OwnerId,
  ids: ReadonlyArray<MemoryId>,
): Promise<number> {
  if (ids.length === 0) return 0
  const records = await peer.fetch(ownerId, ids)
  await store.upsertForSync(ownerId, records)
  return records.length
}

async function reconcileLifecycle(
  store: SyncableStore,
  peer: SyncPeer,
  ownerId: OwnerId,
  ids: ReadonlyArray<MemoryId>,
  local: Map<string, SyncCatalogEntry>,
  remote: Map<string, SyncCatalogEntry>,
  ctx: SupersedeContext,
): Promise<number> {
  const pushIds: MemoryId[] = []
  const pullUpdates: Array<{ id: MemoryId; lifecycle: MemoryLifecycle }> = []
  let mergedCount = 0

  for (const id of ids) {
    const l = local.get(id)
    const r = remote.get(id)
    if (!l || !r) continue
    if (lifecycleEquals(l.lifecycle, r.lifecycle)) continue

    const merged = mergeLifecycle(l.lifecycle, r.lifecycle, ctx)
    mergedCount++

    if (!lifecycleEquals(merged, l.lifecycle)) {
      pullUpdates.push({ id, lifecycle: merged })
    }
    if (!lifecycleEquals(merged, r.lifecycle)) {
      pushIds.push(id)
    }
  }

  // Push records whose lifecycle changed for the peer (we send full records;
  // peer's upsert applies its own merge as a defence in depth).
  if (pushIds.length > 0) {
    const records = await store.fetchById(ownerId, pushIds)
    // Replace the lifecycle in the outgoing records with the merged value
    // so peer's upsert agrees with what we just decided.
    const updated = records.map((rec): MemoryRecord => {
      const merged = mergeLifecycle(rec.lifecycle, remote.get(rec.id)?.lifecycle ?? {}, ctx)
      return { ...rec, lifecycle: merged }
    })
    await peer.push(ownerId, updated)
  }

  for (const update of pullUpdates) {
    await store.applyLifecycleUpdate(ownerId, update.id, update.lifecycle)
  }

  return mergedCount
}
