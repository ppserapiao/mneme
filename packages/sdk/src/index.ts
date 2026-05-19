export { Mneme } from './mneme'
export type {
  MnemeOptions,
  RememberInput,
  RecallOptions,
  ForgetOptions,
} from './mneme'

export { SqliteStore } from './store/sqlite'
export type { SqliteStoreOptions } from './store/sqlite'

export type { Clock } from './util/clock'
export { systemClock } from './util/clock'
export { defaultStoragePath } from './util/path'

export type { Embedder } from './embedder/types'

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
