export { syncOnce } from './engine'
export type { SyncableStore, SyncResult } from './engine'

export { InProcessSyncPeer } from './in-process-peer'
export type { SyncCatalog, SyncCatalogEntry, SyncPeer } from './peer'

export { lifecycleEquals, mergeLifecycle } from './lifecycle-merge'
export type { SupersedeContext } from './lifecycle-merge'
