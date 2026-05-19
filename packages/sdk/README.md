# @mneme/sdk

The TypeScript SDK for the [mneme Protocol](../../docs/protocol).

> Status: `v0.0.3`. Local-only, but now with **opt-in AES-256-GCM encryption at rest** and pluggable on-device semantic recall. Sync engine and hosted backends still ahead.

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

Pass a `passphrase` through the async `Mneme.open()` factory. Bodies are sealed with AES-256-GCM, per-record data keys are wrapped under a master key derived from the passphrase via Argon2id, and the AAD binds each record's id.

```ts
import { Mneme } from '@mneme/sdk'

const mneme = await Mneme.open({ passphrase: 'correct horse battery staple' })

await mneme.remember({ kind: 'fact', body: 'london resident' })
const back = await mneme.get(/* id */)
console.log(back?.body) // { mode: 'plaintext', data: 'london resident' }

// On disk, the body column is ciphertext only. The plaintext above is the
// SDK decrypting transparently before returning to the caller.
```

- The synchronous `new Mneme()` constructor throws if you pass a passphrase — encryption requires the async factory by design.
- Wrong passphrase on reopen raises `MnemeError` with code `unauthorized` before any record is touched.
- **v0.0.3 has no recovery phrase yet.** Losing your passphrase loses the store. BIP-39 recovery + signed writes land in v0.0.4. See [ADR 0005](../../decisions/0005-encryption-envelope-v0-3.md).
- Lexical BM25 recall is silently empty under encryption (FTS5 cannot index ciphertext). Combine with `@mneme/embedder-local` for semantic recall over encrypted memory — embeddings are computed pre-encryption.

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

## API

```ts
new Mneme({
  path?: string         // default: defaultStoragePath()
  ownerId?: string      // default: 'local'
  clock?: Clock         // default: systemClock — override in tests
  embedder?: Embedder   // default: undefined — falls back to lexical BM25 search
})

await Mneme.open({
  // …same options as above, plus:
  passphrase?: string   // when set, encryption-at-rest is enabled
  kdfParams?: KdfParams // optional Argon2id tuning; defaults to OWASP interactive
})
```

Verbs:

- `remember(input)` — persist a new memory (`kind`, `body`, optional `sourceApp`, `tags`, `confidence`)
- `recall(query, options?)` — search; returns `Array<{ record, score }>`. Semantic when an embedder is configured; lexical BM25 otherwise.
- `get(id)` — fetch a single record by ID; null if not found
- `forget(id, { hard? })` — soft-expire (default) or schedule hard delete
- `supersede(id, replacement)` — atomic replace; old record is linked via `supersededBy`
- `exportAll()` — async iterable over every record (including superseded / expired)
- `close()` — release the underlying SQLite handle

## Design notes

- **Search is lexical (FTS5 BM25) by default, semantic when an `embedder` is configured.** Embedders are pluggable via the [`Embedder`](./src/embedder/types.ts) interface. Ship-it implementations live in sibling packages: `@mneme/embedder-local` (on-device via transformers.js), `@mneme/embedder-voyage` (hosted, coming soon).
- **Single embedder per store.** Records written without an embedder are invisible to semantic search. Records written with a different embedder produce stale vectors. Re-embedding migration lands in a later version — see [ADR 0004](../../decisions/0004-local-first-embedding-strategy.md).
- **Append-only at the storage layer.** Forgetting and superseding never delete rows — they mark lifecycle state and filter from queries. This preserves audit history and matches the protocol's lifecycle semantics.
- **Owner isolation enforced at every verb.** A record written under `ownerId: 'pedro'` is unreachable from a Mneme constructed with `ownerId: 'ana'`, even against the same database file.

## License

Apache-2.0.
