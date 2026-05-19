# @mnemehq/sdk

The TypeScript SDK for the [mneme Protocol](../../docs/protocol).

> Status: `v0.1.0` — first npm release. Local-first, with **AES-256-GCM encryption at rest**, **BIP-39 recovery phrase**, **Ed25519 signed writes**, **two-way sync engine**, **multi-device pairing ceremony**, and pluggable on-device semantic recall. Network transports ship in the companion [`@mnemehq/sync-websocket`](../sync-websocket) package; hosted backend lands in v0.2.0.

## Install

```sh
bun add @mnemehq/sdk
# or npm i @mnemehq/sdk
```

Requires Bun `>= 1.3` (the SDK uses `bun:sqlite` natively). Node support arrives in v0.1.

## Zero-config local mode

```ts
import { Mneme } from '@mnemehq/sdk'

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
import { Mneme } from '@mnemehq/sdk'

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
- Lexical BM25 recall is **disabled under encryption** (FTS5 cannot index ciphertext) and raises `MnemeError({ code: 'unsupported_payload_mode' })`. Combine with `@mnemehq/embedder-local` for semantic recall over encrypted memory — embeddings are computed pre-encryption.

See [ADR 0006](../../decisions/0006-recovery-phrase-and-signed-writes.md) for the dual-wrapping design and Ed25519 derivation; [ADR 0005](../../decisions/0005-encryption-envelope-v0-3.md) for the underlying envelope.

## Semantic recall (opt-in)

Install [`@mnemehq/embedder-local`](../embedder-local) and pass it in:

```ts
import { Mneme } from '@mnemehq/sdk'
import { LocalEmbedder } from '@mnemehq/embedder-local'

const mneme = new Mneme({ embedder: new LocalEmbedder() })

await mneme.remember({
  kind: 'preference',
  body: 'Prefers concise code review comments',
})

// "feedback style" never appears verbatim. Semantic recall finds it anyway.
const matches = await mneme.recall('feedback style on pull requests')
```

When an `embedder` is configured, every plaintext `remember()` persists an embedding and `recall()` ranks by cosine similarity. Without one, `recall()` falls back to SQLite FTS5 BM25.

## Multi-device pairing

Before two devices can sync **encrypted** memories, they need the same master key. Pairing transfers it from a paired device A to a fresh device B over an untrusted channel, with a 6-digit Short Authentication String (SAS) the user verifies on both screens.

```ts
// === DEVICE A (already set up with passphrase) ===
const session = alice.beginPairing()
// Hand `session.invite` to device B (QR code, file, side channel — any transport)

// After B sends back its `response`:
const completed = await session.complete(responseFromB)
console.log('Verify this matches device B:', completed.sas) // 6 digits

// User confirms SAS matches on both devices → commit
const bundle = await completed.commit()
// Send `bundle` back to B
```

```ts
// === DEVICE B (fresh, no keyring yet) ===
const accepted = await Mneme.acceptPairing(inviteFromA)
console.log('Verify this matches device A:', accepted.sas) // 6 digits
// Send `accepted.response` to A

// Once A's bundle arrives:
const { mneme: bob, recoveryPhrase } = await accepted.finalize(bundle, {
  path: '/path/to/b.sqlite',
  passphrase: 'bob-passphrase',
})
console.log('SAVE THIS:', recoveryPhrase) // B's OWN 24-word phrase
console.log(bob.publicKey === alice.publicKey) // true — same master key
```

After pairing, B has its own keyring (own passphrase, own recovery phrase) wrapping the **same master key** as A — so `bob.publicKey === alice.publicKey`, and the standard `alice.sync(bob.asPeer())` exchanges records that decrypt cleanly on both sides.

The cryptographic design (X25519 ECDH + HKDF-SHA256 + AES-256-GCM, 6-digit SAS, 5-minute session expiry, replay protection) is in [ADR 0009](../../decisions/0009-multi-device-pairing-ceremony.md). **Always verify the SAS on a side channel** the user trusts (in person, voice call, signed Signal message) — if you skip verification, an active MITM can substitute their own keys.

For real cross-machine pairing over the network, use [`@mnemehq/sync-websocket`](../sync-websocket) which wraps the three-message ceremony in a WebSocket flow with `onSasReady` callbacks gating commit.

## Sync (multi-device, transport-agnostic)

```ts
import { Mneme } from '@mnemehq/sdk'

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

`SyncPeer` is the transport-agnostic interface (`catalog`, `fetch`, `push`). The SDK ships `InProcessSyncPeer` for tests / single-process demos. [`@mnemehq/sync-websocket`](../sync-websocket) ships `WebSocketSyncPeer` + `WebSocketSyncServer` for real cross-machine sync. The hosted Mneme Cloud target (v0.1.0) will implement the same three methods over HTTPS+JSON. The engine doesn't change.

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

- **Search is lexical (FTS5 BM25) by default, semantic when an `embedder` is configured.** Embedders are pluggable via the [`Embedder`](./src/embedder/types.ts) interface. Ship-it implementations live in sibling packages: `@mnemehq/embedder-local` (on-device via transformers.js), `@mnemehq/embedder-voyage` (hosted, coming soon).
- **Single embedder per store.** Records written without an embedder are invisible to semantic search. Records written with a different embedder produce stale vectors. Re-embedding migration lands in a later version — see [ADR 0004](../../decisions/0004-local-first-embedding-strategy.md).
- **Append-only at the storage layer.** Forgetting and superseding never delete rows — they mark lifecycle state and filter from queries. This preserves audit history and matches the protocol's lifecycle semantics.
- **Owner isolation enforced at every verb.** A record written under `ownerId: 'pedro'` is unreachable from a Mneme constructed with `ownerId: 'ana'`, even against the same database file.

## License

Apache-2.0.
