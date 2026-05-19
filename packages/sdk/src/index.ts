export { Mneme } from './mneme'
export type {
  EncryptedMnemeOptions,
  ForgetOptions,
  InitializeResult,
  MnemeOptions,
  RecallOptions,
  RememberInput,
} from './mneme'

export { SqliteStore } from './store/sqlite'
export type { SqliteStoreOptions } from './store/sqlite'

export type { Clock } from './util/clock'
export { systemClock } from './util/clock'
export { defaultStoragePath } from './util/path'

export type { Embedder } from './embedder/types'

export { DEFAULT_KDF_PARAMS } from './crypto'
export type { KdfParams } from './crypto'

export { InProcessSyncPeer, lifecycleEquals, mergeLifecycle, syncOnce } from './sync'
export type {
  SupersedeContext,
  SyncCatalog,
  SyncCatalogEntry,
  SyncPeer,
  SyncResult,
  SyncableStore,
} from './sync'

// Re-export the canonical protocol surface so consumers only need one import.
export {
  MEMORY_KINDS,
  MnemeError,
  PROTOCOL_VERSION,
} from '@mneme/protocol'
export type {
  Embedding,
  EncryptedPayload,
  MemoryId,
  MemoryKind,
  MemoryLifecycle,
  MemoryMetadata,
  MemoryRecord,
  MnemeErrorCode,
  MnemeStore,
  OwnerId,
  Payload,
  PlaintextPayload,
  SearchResult,
} from '@mneme/protocol'
