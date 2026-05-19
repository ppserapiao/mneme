import type { MemoryId, MemoryRecord, OwnerId } from '@mneme/protocol'
import type { SqliteStore } from '../store/sqlite'
import type { SyncCatalog, SyncPeer } from './peer'

/**
 * SyncPeer that talks directly to another store inside the same process.
 *
 * Use case: tests, single-process demos, and any consumer that wants to
 * write its own transport (file sync, IPC, BLE) — wrap your transport in
 * a `SyncPeer` implementation and call `mneme.sync(peer)`.
 *
 * Production WebSocket and HTTP transports in v0.0.7+ will implement the
 * same `SyncPeer` interface against a network store.
 */
export class InProcessSyncPeer implements SyncPeer {
  constructor(private readonly store: SqliteStore) {}

  catalog(ownerId: OwnerId): Promise<SyncCatalog> {
    return this.store.catalog(ownerId)
  }

  fetch(ownerId: OwnerId, ids: ReadonlyArray<MemoryId>): Promise<ReadonlyArray<MemoryRecord>> {
    return this.store.fetchById(ownerId, ids)
  }

  push(ownerId: OwnerId, records: ReadonlyArray<MemoryRecord>): Promise<void> {
    return this.store.upsertForSync(ownerId, records)
  }
}
