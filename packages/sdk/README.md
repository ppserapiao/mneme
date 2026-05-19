# @mneme/sdk

The TypeScript SDK for the [mneme Protocol](../../docs/protocol).

> Status: `v0.0.6`. Local-first, with **AES-256-GCM encryption at rest**, **BIP-39 recovery phrase**, **Ed25519 signed writes**, **two-way sync engine**, and pluggable on-device semantic recall. Network transports + hosted backend land in v0.0.7+.

## Install

```sh
bun add @mneme/sdk
# or npm i @mneme/sdk
```

Requires Bun `>= 1.3` (the SDK uses `bun:sqlite` natively). Node support arrives in v0.1.

## Zero-config local mode

```ts
import { Mneme } from '@mneme/sdk'

const mneme = new Mneme()

await mneme.remember({
  kind: 'preference',
  body: 'Prefers concise code review comments',
  sourceApp: 'my-app',
})

const matches = await mneme.recall('how does this user like feedback?')
console.log(matches[0]?.record.body)
```

By default the SDK writes to a platform-appropriate location:

- macOS: `~/Library/Application Support/Mneme/memory.sqlite`
- Linux: `$XDG_DATA_HOME/Mneme/memory.sqlite` (falls back to `~/.local/share`)
- Windows: `%APPDATA%/Mneme/memory.sqlite`

Pass `path: ':memory:'` for an ephemeral store (recommended in tests).

## Encryption at rest (opt-in)

Encryption uses **AES-256-GCM** with per-record data keys wrapped under a **random master key**. The master key is itself wrapped under **two** independent keys: one derived from your passphrase via Argon2id, one derived from a 24-word BIP-39 **recovery phrase**. Either unlocks the store; either unlocks the SAME records.

```ts
import { Mneme } from '@mneme/sdk'

// First time — generate keys and the recovery phrase
const { mneme, recoveryPhrase } = await Mneme.initialize({
  passphrase: 'correct horse battery staple',
})
console.log('SAVE THIS:', recoveryPhrase) // 24 words, shown once

await mneme.remember({ kind: 'fact', body: 'london resident' })
console.log(mneme.publicKey) // base64url Ed25519 public key
```

```ts
// Subsequent opens — passphrase
const mneme = await Mneme.open({ passphrase: 'correct horse battery staple' })

// Or if the passphrase is forgotten — recovery phrase
const mneme = await Mneme.open({ recoveryPhrase: 'word word word …' })
```

- `new Mneme()` (sync) refuses any encryption option — encrypted mode requires `Mneme.initialize()` or `Mneme.open()`.
- Wrong passphrase / invalid recovery phrase raises `MnemeError` with code `unauthorized` before any record is touched.
- `Mneme.publicKey` is the **stable Ed25519 public key** for the store — same value whether you unlocked with passphrase or recovery phrase. Use it to externally verify the `signature` on any record this store has written.
- Lexical BM25 recall is **disabled under encryption** (FTS5 cannot index ciphertext) and raises `MnemeError({ code: 'unsupported_payload_mode' })`. Combine with `@mneme/embedder-local` for semantic recall over encrypted memory — embeddings are computed pre-encryption.

See [ADR 0006](../../decisions/0006-recovery-phrase-and-signed-writes.md) for the dual-wrapping design and Ed25519 derivation; [ADR 0005](../../decisions/0005-encryption-envelope-v0-3.md) for the underlying envelope.

## Semantic recall (opt-in)

Install [`@mneme/embedder-local`](../embedder-local) and pass it in:

```ts
import { Mneme } from '@mneme/sdk'
import { LocalEmbedder } from '@mneme/embedder-local'

const mneme = new Mneme({ embedder: new LocalEmbedder() })

await mneme.remember({
  kind: 'preference',
  body: 'Prefers concise code review comments',
})

// "feedback style" never appears verbatim. Semantic recall finds it anyway.
const matches = await mneme.recall('feedback style on pull requests')
```

When an `embedder` is configured, every plaintext `remember()` persists an embedding and `recall()` ranks by cosine similarity. Without one, `recall()` falls back to SQLite FTS5 BM25.

## Sync (multi-device, transport-agnostic)

```ts
import { Mneme } from '@mneme/sdk'

const alice = new Mneme({ path: '/path/to/alice.sqlite', ownerId: 'pedro' })
const bob = new Mneme({ path: '/path/to/bob.sqlite', ownerId: 'pedro' })

await alice.remember({ kind: 'fact', body: 'london resident' })
await bob.remember({ kind: 'preference', body: 'prefers concise reviews' })

const result = await alice.sync(bob.asPeer())
// → { pushed: 1, pulled: 1, merged: 0 }

// alice and bob now have the same record set. Re-running sync is a no-op.
```

The engine is the load-bearing wall of the differentiation — it converges two stores' record sets and merges lifecycle envelopes deterministically:

- **`supersededBy`** — both replacements are kept on disk; the pointer follows the replacement with the latest `createdAt`.
- **`expiresAt`** — earliest wins (strictest expiry honoured).
- **`forgetAt`** — earliest wins (strictest forget schedule honoured).

The merge is commutative, associative, and idempotent. See [ADR 0008](../../decisions/0008-sync-engine-design.md) for the full design.

`SyncPeer` is the transport-agnostic interface (`catalog`, `fetch`, `push`). v0.0.6 ships `InProcessSyncPeer` for tests / single-process demos. WebSocket and HTTP transports — including the hosted Mneme Cloud target — implement the same three methods in later versions, and the engine doesn't change.

> Encrypted sync currently requires both peers to share the same master key. The **pairing ceremony** that establishes that shared key on a second device is the v0.0.7 work. v0.0.6 ships the engine.

## API

```ts
new Mneme({
  path?: string         // default: defaultStoragePath()
  ownerId?: string      // default: 'local'
  clock?: Clock         // default: systemClock — override in tests
  embedder?: Embedder   // default: undefined — falls back to lexical BM25 search
})

// Fresh encrypted store — returns recovery phrase once
const { mneme, recoveryPhrase } = await Mneme.initialize({
  // …same MnemeOptions as above, plus:
  passphrase: string    // REQUIRED for initialize
  kdfParams?: KdfParams // optional Argon2id tuning; defaults to OWASP interactive
})

// Existing store (plaintext or encrypted)
await Mneme.open({
  passphrase?: string       // when set, opens an existing encrypted store
  recoveryPhrase?: string   // alternative to passphrase (mutually exclusive)
})
```

Verbs:

- `remember(input)` — persist a new memory (`kind`, `body`, optional `sourceApp`, `tags`, `confidence`)
- `recall(query, options?)` — search; returns `Array<{ record, score }>`. Semantic when an embedder is configured; lexical BM25 otherwise.
- `get(id)` — fetch a single record by ID; null if not found
- `forget(id, { hard? })` — soft-expire (default) or schedule hard delete
- `supersede(id, replacement)` — atomic replace; old record is linked via `supersededBy`
- `exportAll()` — async iterable over every record (including superseded / expired)
- `sync(peer)` — bidirectional convergence with another store via a `SyncPeer` (ADR 0008)
- `close()` — release the underlying SQLite handle

## Design notes

- **Search is lexical (FTS5 BM25) by default, semantic when an `embedder` is configured.** Embedders are pluggable via the [`Embedder`](./src/embedder/types.ts) interface. Ship-it implementations live in sibling packages: `@mneme/embedder-local` (on-device via transformers.js), `@mneme/embedder-voyage` (hosted, coming soon).
- **Single embedder per store.** Records written without an embedder are invisible to semantic search. Records written with a different embedder produce stale vectors. Re-embedding migration lands in a later version — see [ADR 0004](../../decisions/0004-local-first-embedding-strategy.md).
- **Append-only at the storage layer.** Forgetting and superseding never delete rows — they mark lifecycle state and filter from queries. This preserves audit history and matches the protocol's lifecycle semantics.
- **Owner isolation enforced at every verb.** A record written under `ownerId: 'pedro'` is unreachable from a Mneme constructed with `ownerId: 'ana'`, even against the same database file.

## License

Apache-2.0.
