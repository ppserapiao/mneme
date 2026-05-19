# @mneme/sdk

The TypeScript SDK for the [mneme Protocol](../../docs/protocol).

> Status: `v0.0.2`. Local-only, plaintext, no encryption or sync yet, but semantic recall is in via the pluggable embedder interface. The API surface is stable; everything below it will gain encryption (v0.1), sync (v0.2), and hosted backends (v0.3).

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
