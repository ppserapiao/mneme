import type {
  MemoryId,
  MemoryKind,
  MemoryRecord,
  OwnerId,
  SearchResult,
  WriteMetadata,
} from '@mneme/protocol'
import { OwnerIdSchema } from '@mneme/protocol'
import { SqliteStore } from './store/sqlite'
import type { Clock } from './util/clock'
import { defaultStoragePath } from './util/path'

export type MnemeOptions = {
  /** Filesystem path for the SQLite store. Defaults to a platform-appropriate location. Pass `:memory:` for ephemeral in-process storage. */
  path?: string
  /** Logical owner identifier. Defaults to `"local"`. */
  ownerId?: string
  /** Time source. Override in tests for determinism. */
  clock?: Clock
}

export type RememberInput = {
  kind: MemoryKind
  body: string
  sourceApp?: string
  sourceContext?: string
  confidence?: number
  tags?: ReadonlyArray<string>
}

export type RecallOptions = {
  limit?: number
  kinds?: ReadonlyArray<MemoryKind>
}

export type ForgetOptions = {
  /** When true, schedule a hard delete in addition to expiring the record. */
  hard?: boolean
}

/**
 * The developer-facing entry point to a local Mneme store.
 *
 * Zero-config by design: `new Mneme()` opens a SQLite file at a sensible
 * platform location and exposes English verbs over the protocol-level
 * `MnemeStore` contract. Hosted, encrypted, and synced variants land in
 * later SDK versions and ship as drop-in alternative constructors.
 */
export class Mneme {
  private readonly store: SqliteStore
  private readonly ownerId: OwnerId

  constructor(options: MnemeOptions = {}) {
    this.ownerId = OwnerIdSchema.parse(options.ownerId ?? 'local')
    this.store = new SqliteStore({
      path: options.path ?? defaultStoragePath(),
      ...(options.clock ? { clock: options.clock } : {}),
    })
  }

  /** Persist a new memory. Returns the canonical record that was stored. */
  async remember(input: RememberInput): Promise<MemoryRecord> {
    const metadata: WriteMetadata = {}
    if (input.sourceApp !== undefined) metadata.sourceApp = input.sourceApp
    if (input.sourceContext !== undefined) metadata.sourceContext = input.sourceContext
    if (input.confidence !== undefined) metadata.confidence = input.confidence
    if (input.tags !== undefined) metadata.tags = input.tags

    return this.store.write({
      ownerId: this.ownerId,
      kind: input.kind,
      body: { mode: 'plaintext', data: input.body },
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    })
  }

  /** Semantic-ish search over plaintext memories. Returns ranked records with scores. */
  async recall(query: string, options: RecallOptions = {}): Promise<SearchResult[]> {
    return this.store.search({
      ownerId: this.ownerId,
      query,
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(options.kinds !== undefined ? { kinds: options.kinds } : {}),
    })
  }

  /** Fetch a single memory by ID. Returns null if it does not exist for this owner. */
  async get(id: MemoryId): Promise<MemoryRecord | null> {
    return this.store.read(this.ownerId, id)
  }

  /** Mark a memory as forgotten. Soft by default; pass `{ hard: true }` to schedule a hard delete. */
  async forget(id: MemoryId, options: ForgetOptions = {}): Promise<void> {
    return this.store.forget({
      ownerId: this.ownerId,
      id,
      ...(options.hard !== undefined ? { hard: options.hard } : {}),
    })
  }

  /** Replace an existing memory with a new one. The old record remains, linked via `supersededBy`. */
  async supersede(id: MemoryId, replacement: RememberInput): Promise<MemoryRecord> {
    const metadata: WriteMetadata = {}
    if (replacement.sourceApp !== undefined) metadata.sourceApp = replacement.sourceApp
    if (replacement.sourceContext !== undefined) metadata.sourceContext = replacement.sourceContext
    if (replacement.confidence !== undefined) metadata.confidence = replacement.confidence
    if (replacement.tags !== undefined) metadata.tags = replacement.tags

    return this.store.supersede({
      ownerId: this.ownerId,
      supersededId: id,
      replacement: {
        ownerId: this.ownerId,
        kind: replacement.kind,
        body: { mode: 'plaintext', data: replacement.body },
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
    })
  }

  /** Stream every memory for this owner, including superseded and forgotten records. */
  async *exportAll(): AsyncIterable<MemoryRecord> {
    yield* this.store.export({ ownerId: this.ownerId })
  }

  /** Release the underlying database handle. Safe to call multiple times. */
  close(): void {
    this.store.close()
  }
}
