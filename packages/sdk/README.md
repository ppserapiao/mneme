# @mneme/sdk

The TypeScript SDK for the [Mneme Protocol](../../docs/protocol).

> Status: `v0.0.1`. Local-only, plaintext, no encryption or sync yet. The API surface is stable; everything below it will gain encryption (v0.1), sync (v0.2), and hosted backends (v0.3).

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

## API

```ts
new Mneme({
  path?: string         // default: defaultStoragePath()
  ownerId?: string      // default: 'local'
  clock?: Clock         // default: systemClock — override in tests
})
```

Verbs:

- `remember(input)` — persist a new memory (`kind`, `body`, optional `sourceApp`, `tags`, `confidence`)
- `recall(query, options?)` — search; returns `Array<{ record, score }>`
- `get(id)` — fetch a single record by ID; null if not found
- `forget(id, { hard? })` — soft-expire (default) or schedule hard delete
- `supersede(id, replacement)` — atomic replace; old record is linked via `supersededBy`
- `exportAll()` — async iterable over every record (including superseded / expired)
- `close()` — release the underlying SQLite handle

## Design notes

- **Lexical search via SQLite FTS5.** v0.0.1 uses BM25 over plaintext bodies. Embedding-based search lands when `@mneme/embedder-local` and `@mneme/embedder-voyage` ship.
- **Append-only at the storage layer.** Forgetting and superseding never delete rows in v0.0.1 — they mark lifecycle state and filter from queries. This preserves audit history and matches the protocol's lifecycle semantics.
- **Owner isolation enforced at every verb.** A record written under `ownerId: 'pedro'` is unreachable from a Mneme constructed with `ownerId: 'ana'`, even against the same database file.

## License

Apache-2.0.
