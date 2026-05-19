import type { MemoryId, MemoryLifecycle, MemoryRecord, OwnerId } from '@mneme/protocol'

/**
 * Minimum digest a peer needs to expose for two stores to diff their record
 * sets. The lifecycle is included because lifecycle is the only mutable
 * surface — body, metadata, and signature are immutable post-write, so a
 * record's `id` alone tells us "is it present?" and the `lifecycle` tells us
 * "does it need merging?"
 */
export type SyncCatalogEntry = {
  id: MemoryId
  createdAt: string
  lifecycle: MemoryLifecycle
}

export type SyncCatalog = {
  entries: ReadonlyArray<SyncCatalogEntry>
}

/**
 * Transport-agnostic peer for two-way sync. The engine in `engine.ts`
 * consumes this interface and is unaware of how records actually move
 * between machines. v0.0.6 ships one concrete implementation,
 * {@link InProcessSyncPeer}; WebSocket and Cloud transports in later
 * versions implement the same three methods.
 *
 * Methods MUST be scoped to a single `ownerId` per call — sync does not
 * cross owner boundaries (ADR 0008 §8).
 */
export interface SyncPeer {
  /** Enumerate every record this peer holds for `ownerId`, lifecycle included. */
  catalog(ownerId: OwnerId): Promise<SyncCatalog>

  /** Fetch full records by id. Order is unspecified; callers MUST index by id. */
  fetch(ownerId: OwnerId, ids: ReadonlyArray<MemoryId>): Promise<ReadonlyArray<MemoryRecord>>

  /**
   * Apply a batch of records to this peer's store. Each record is upserted
   * via the peer's sync path: new records inserted as-is, existing records
   * merged per ADR 0008 §2.
   */
  push(ownerId: OwnerId, records: ReadonlyArray<MemoryRecord>): Promise<void>
}
