import type {
  MemoryId,
  MemoryKind,
  MemoryRecord,
  OwnerId,
  SearchResult,
  WriteMetadata,
} from '@mneme/protocol'
import { MnemeError, OwnerIdSchema } from '@mneme/protocol'
import type { KdfParams } from './crypto'
import type { Embedder } from './embedder/types'
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
  /**
   * Optional embedder. When supplied, `remember` persists embeddings alongside
   * each plaintext body and `recall` returns records ranked by cosine
   * similarity. Without one, `recall` uses lexical BM25 via SQLite FTS5.
   *
   * Install `@mneme/embedder-local` for on-device embeddings via
   * `@huggingface/transformers`, or implement the `Embedder` interface
   * against any provider.
   */
  embedder?: Embedder

  /**
   * Passphrase for the encryption envelope. When set, plaintext bodies are
   * sealed at rest with AES-256-GCM and the master key is derived via
   * Argon2id with a salt stored in the database.
   *
   * Encrypted mode requires the async factory: `await Mneme.open({ passphrase })`.
   * The synchronous `new Mneme()` constructor stays plaintext-only and throws
   * when given a passphrase.
   *
   * v0.0.3 has NO recovery phrase yet — losing the passphrase means losing
   * the data. Recovery phrase support lands in v0.0.4.
   */
  passphrase?: string

  /**
   * Argon2id parameters used the first time an encrypted store is initialised.
   * Defaults to OWASP-recommended interactive settings (64 MiB, 3 iterations).
   * Reduce for tests; increase for high-security deployments. Stored to the
   * DB on first init, ignored on subsequent opens (the persisted params win).
   */
  kdfParams?: KdfParams
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
    if (options.passphrase !== undefined) {
      throw new MnemeError(
        'invalid_record',
        'Encrypted mode requires the async factory: await Mneme.open({ passphrase }). The sync constructor is plaintext-only.',
      )
    }
    this.ownerId = OwnerIdSchema.parse(options.ownerId ?? 'local')
    this.store = new SqliteStore({
      path: options.path ?? defaultStoragePath(),
      ...(options.clock ? { clock: options.clock } : {}),
      ...(options.embedder ? { embedder: options.embedder } : {}),
    })
  }

  /**
   * Recommended way to construct a `Mneme` instance, especially when
   * encryption is desired. Supports both modes:
   *
   *   const m = await Mneme.open()                    // plaintext local mode
   *   const m = await Mneme.open({ passphrase: 'x' }) // encrypted mode
   *
   * In encrypted mode the master key is derived from the passphrase via
   * Argon2id and verified against a stored verifier; a wrong passphrase
   * raises an `unauthorized` MnemeError without decrypting any record.
   */
  static async open(options: MnemeOptions = {}): Promise<Mneme> {
    const { passphrase, kdfParams, ...rest } = options
    if (passphrase === undefined) {
      return new Mneme(rest)
    }
    // Construct via the sync path with passphrase removed so the constructor
    // does not refuse it, then layer encryption on by deriving the master key.
    const mneme = new Mneme(rest)
    if (kdfParams !== undefined) {
      await mneme.store.openMasterKey(passphrase, kdfParams)
    } else {
      await mneme.store.openMasterKey(passphrase)
    }
    return mneme
  }

  /** Whether the underlying store is in encryption-at-rest mode. */
  get encrypted(): boolean {
    return this.store.encrypted
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

  /** Search over plaintext memories. Semantic when an `embedder` is configured; lexical BM25 otherwise. Returns ranked records with scores. */
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
