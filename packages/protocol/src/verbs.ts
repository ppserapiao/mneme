import type { MemoryId, OwnerId } from './ids'
import type { MemoryKind } from './kinds'
import type { Payload } from './payload'
import type { MemoryRecord } from './record'

export type WriteMetadata = {
  sourceApp?: string
  sourceContext?: string
  confidence?: number
  tags?: ReadonlyArray<string>
}

export type WriteInput = {
  ownerId: OwnerId
  kind: MemoryKind
  body: Payload
  metadata?: WriteMetadata
}

export type SearchInput = {
  ownerId: OwnerId
  query: string
  limit?: number
  kinds?: ReadonlyArray<MemoryKind>
}

export type SearchResult = {
  record: MemoryRecord
  /** Implementation-defined similarity score, higher = more relevant. */
  score: number
}

export type ForgetInput = {
  ownerId: OwnerId
  id: MemoryId
  /** When true, schedule hard delete via `lifecycle.forgetAt`. Defaults to soft. */
  hard?: boolean
}

export type SupersedeInput = {
  ownerId: OwnerId
  supersededId: MemoryId
  replacement: WriteInput
}

export type ExportInput = {
  ownerId: OwnerId
  /** ISO-8601 lower bound. If absent, exports from beginning of time. */
  since?: string
}

/**
 * The minimum verb set every Mneme Protocol implementation must satisfy.
 *
 * Implementations MAY expose additional provider-specific verbs but MUST
 * implement these exactly. The conformance suite at `tests/conformance/`
 * verifies behavior against this interface.
 *
 * The `OBSERVE` verb (subscribe to changes) is intentionally omitted from
 * v0.1 — it lands in v0.2 alongside the sync engine.
 */
export interface MnemeStore {
  write(input: WriteInput): Promise<MemoryRecord>
  read(ownerId: OwnerId, id: MemoryId): Promise<MemoryRecord | null>
  search(input: SearchInput): Promise<SearchResult[]>
  forget(input: ForgetInput): Promise<void>
  supersede(input: SupersedeInput): Promise<MemoryRecord>
  export(input: ExportInput): AsyncIterable<MemoryRecord>
}
