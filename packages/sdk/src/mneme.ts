import type {
  MemoryId,
  MemoryKind,
  MemoryRecord,
  OwnerId,
  SearchResult,
  WriteMetadata,
} from '@mnemehq/protocol'
import { MnemeError, OwnerIdSchema } from '@mnemehq/protocol'
import { type KdfParams, toBase64Url } from './crypto'
import type { Embedder } from './embedder/types'
import type {
  AcceptedPairing,
  PairingInvite,
  PairingSession,
  PairingTransferBundle,
} from './pairing'
import { acceptPairing as acceptPairingCeremony } from './pairing/accept'
import { beginPairing as beginPairingCeremony } from './pairing/invite'
import { SqliteStore } from './store/sqlite'
import type { SyncResult } from './sync/engine'
import { syncOnce } from './sync/engine'
import { InProcessSyncPeer } from './sync/in-process-peer'
import type { SyncPeer } from './sync/peer'
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
   * Install `@mnemehq/embedder-local` for on-device embeddings via
   * `@huggingface/transformers`, or implement the `Embedder` interface
   * against any provider.
   */
  embedder?: Embedder
}

export type EncryptedMnemeOptions = MnemeOptions & {
  /**
   * Passphrase for the encryption envelope. When set, plaintext bodies are
   * sealed at rest with AES-256-GCM and the master key is wrapped by an
   * Argon2id-derived key plus a BIP-39 recovery phrase.
   */
  passphrase?: string

  /** Alternative to `passphrase` for `Mneme.open()` — the user's BIP-39 recovery phrase. */
  recoveryPhrase?: string

  /**
   * Argon2id parameters used the first time a keyring is initialised.
   * Defaults to OWASP-recommended interactive settings (64 MiB, 3 iterations).
   * Reduce for tests; increase for high-security deployments. Stored to the
   * keyring on first init, ignored on subsequent opens.
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
 * Returned from `Mneme.initialize()`. The recovery phrase is shown to the
 * user ONCE — the SDK does not retain a copy and there is no way to display
 * it again later. Lose it together with the passphrase and the store is
 * permanently unreadable.
 */
export type InitializeResult = {
  mneme: Mneme
  recoveryPhrase: string
}

/**
 * The developer-facing entry point to a local Mneme store.
 *
 * - `new Mneme()` — synchronous, plaintext-only local store.
 * - `await Mneme.open({ passphrase | recoveryPhrase })` — open an existing
 *   encrypted store.
 * - `await Mneme.initialize({ passphrase })` — create a NEW encrypted store
 *   and receive its recovery phrase exactly once.
 */
export class Mneme {
  private readonly store: SqliteStore
  private readonly ownerId: OwnerId

  constructor(options: MnemeOptions = {}) {
    if ((options as EncryptedMnemeOptions).passphrase !== undefined) {
      throw new MnemeError(
        'invalid_record',
        'Encrypted mode requires the async factory: await Mneme.initialize({ passphrase }) for a new store, or Mneme.open({ passphrase | recoveryPhrase }) for an existing one. The sync constructor is plaintext-only.',
      )
    }
    if ((options as EncryptedMnemeOptions).recoveryPhrase !== undefined) {
      throw new MnemeError(
        'invalid_record',
        'Encrypted mode requires the async factory: await Mneme.open({ recoveryPhrase }). The sync constructor is plaintext-only.',
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
   * Create a NEW encrypted store. Generates a fresh master key, wraps it
   * under both an Argon2id-derived passphrase key and a 24-word BIP-39
   * recovery phrase, derives an Ed25519 signing keypair, and persists the
   * keyring.
   *
   * The returned `recoveryPhrase` is the only copy the SDK will ever produce.
   * Show it to the user once and never retain it server-side.
   *
   * Throws `conflict` if the target store already has a keyring (use
   * `Mneme.open` instead).
   */
  static async initialize(options: EncryptedMnemeOptions): Promise<InitializeResult> {
    if (options.passphrase === undefined) {
      throw new MnemeError('invalid_record', 'Mneme.initialize requires a passphrase')
    }
    const { passphrase, kdfParams, recoveryPhrase, ...rest } = options
    void recoveryPhrase
    const mneme = new Mneme(rest)
    const { recoveryPhrase: phrase } =
      kdfParams !== undefined
        ? await mneme.store.initialiseKeyring(passphrase, kdfParams)
        : await mneme.store.initialiseKeyring(passphrase)
    return { mneme, recoveryPhrase: phrase }
  }

  /**
   * Open an existing store. Behaviour by options:
   *
   *   await Mneme.open()                          // plaintext local mode
   *   await Mneme.open({ passphrase })            // existing encrypted store
   *   await Mneme.open({ recoveryPhrase })        // existing encrypted store via recovery
   *
   * Throws `unauthorized` on wrong passphrase / invalid phrase, and
   * `record_not_found` when no keyring exists yet (use `Mneme.initialize`).
   */
  static async open(options: EncryptedMnemeOptions = {}): Promise<Mneme> {
    const { passphrase, recoveryPhrase, kdfParams, ...rest } = options
    void kdfParams
    if (passphrase !== undefined && recoveryPhrase !== undefined) {
      throw new MnemeError(
        'invalid_record',
        'pass either passphrase or recoveryPhrase to Mneme.open, not both',
      )
    }
    const mneme = new Mneme(rest)
    if (passphrase !== undefined) {
      await mneme.store.openWithPassphrase(passphrase)
    } else if (recoveryPhrase !== undefined) {
      await mneme.store.openWithRecoveryPhrase(recoveryPhrase)
    }
    return mneme
  }

  /** Whether the underlying store is in encryption-at-rest mode. */
  get encrypted(): boolean {
    return this.store.encrypted
  }

  /**
   * Ed25519 public key for this store as a base64url string. Anyone with
   * this key can verify the `signature` on a `MemoryRecord` written by this
   * store. Returns `undefined` when the store is in plaintext mode.
   */
  get publicKey(): string | undefined {
    const key = this.store.publicKey
    return key ? toBase64Url(key) : undefined
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

  /**
   * Search over plaintext memories. Semantic when an `embedder` is configured;
   * lexical BM25 otherwise. Throws `unsupported_payload_mode` when called on
   * an encrypted store without an embedder — FTS5 cannot index ciphertext.
   */
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

  /**
   * Synchronise this store's memory for the current owner with `peer`.
   *
   * Bidirectional: every record one side has and the other does not is
   * exchanged; records present on both sides have their lifecycle envelopes
   * merged per ADR 0008 §2 (latest-target wins for `supersededBy`, earliest
   * wins for `expiresAt` and `forgetAt`).
   *
   * Sync is owner-scoped — only records under `this.ownerId` are touched.
   * Re-running sync is idempotent: a second call against an already-
   * converged peer returns `{ pushed: 0, pulled: 0, merged: 0 }`.
   *
   * For encrypted stores, both peers must share the same master key for the
   * exchanged records to remain readable. v0.0.6 ships the engine; the
   * pairing ceremony that establishes a shared master key lands in v0.0.7.
   * Records exchanged between stores with different master keys remain
   * readable as ciphertext but `get`/`recall` against them will fail
   * `invalid_record` at signature verification time.
   *
   * @see {@link SyncPeer} for transport-agnostic peer contract.
   * @see {@link InProcessSyncPeer} for the in-process peer used in tests.
   */
  async sync(peer: SyncPeer): Promise<SyncResult> {
    return syncOnce(this.store, peer, this.ownerId)
  }

  /**
   * Expose this `Mneme` as a `SyncPeer` for another `Mneme` running in the
   * same process. The two-line two-device demo:
   *
   *   await alice.sync(bob.asPeer())
   *
   * For network transports, implement `SyncPeer` against your wire protocol
   * and pass that to `sync()` instead. The engine is transport-agnostic.
   */
  asPeer(): SyncPeer {
    return new InProcessSyncPeer(this.store)
  }

  // --- Pairing (ADR 0009) ----------------------------------------------

  /**
   * Begin a pairing session — this is the device-A side. The store MUST
   * already be unlocked (encrypted mode). Returns a session object whose
   * `invite` should be transferred to device B (QR, file, side channel).
   *
   * After device B replies with a `PairingResponse`, call
   * `session.complete(response)` and verify the returned `sas` matches the
   * value displayed on device B. Then call `commit()` to produce the
   * encrypted master-key bundle to send back to B.
   *
   * The session's ephemeral private key is held in memory only — it is
   * discarded on `commit()` or when the process exits.
   */
  beginPairing(): PairingSession {
    if (!this.encrypted) {
      throw new MnemeError(
        'invalid_record',
        'pairing requires an encrypted store; open or initialize with a passphrase first',
      )
    }
    const masterKey = this.store.exportMasterKeyForPairing()
    if (!masterKey) {
      throw new MnemeError('storage_failure', 'master key unavailable for pairing')
    }
    return beginPairingCeremony(masterKey)
  }

  /**
   * Accept a pairing invite on the device that does NOT yet have the
   * master key — this is the device-B side. Returns the response to ship
   * back to A, the 6-digit SAS to verify against A's display, and a
   * `finalize(bundle, options)` continuation that decrypts the master
   * key bundle and initialises a fresh `Mneme` keyring locally.
   *
   * Device B chooses its OWN passphrase and receives its OWN 24-word
   * recovery phrase — independent of device A. The two keyrings happen
   * to wrap the same master-key bytes; that's what makes the same record
   * decrypt on both devices.
   */
  static async acceptPairing(invite: PairingInvite): Promise<{
    readonly response: AcceptedPairing['response']
    readonly sas: string
    finalize(
      bundle: PairingTransferBundle,
      options: { passphrase: string; path?: string; ownerId?: string; kdfParams?: KdfParams },
    ): Promise<InitializeResult>
  }> {
    const ceremony = acceptPairingCeremony(invite)
    return {
      response: ceremony.response,
      sas: ceremony.sas,
      async finalize(bundle, options) {
        const masterKey = await ceremony.decryptBundle(bundle)
        if (options.passphrase.length === 0) {
          throw new MnemeError('invalid_record', 'passphrase must not be empty')
        }
        const mneme = new Mneme({
          path: options.path ?? defaultStoragePath(),
          ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}),
        })
        const { recoveryPhrase } = options.kdfParams
          ? await mneme.store.initialiseKeyringWith(
              masterKey,
              options.passphrase,
              options.kdfParams,
            )
          : await mneme.store.initialiseKeyringWith(masterKey, options.passphrase)
        return { mneme, recoveryPhrase }
      },
    }
  }

  /** Release the underlying database handle. Safe to call multiple times. */
  close(): void {
    this.store.close()
  }
}
