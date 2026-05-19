# mneme

**The open, user-sovereign memory layer for AI.**

Your memory. Your keys. Every model. mneme is local-first by design, end-to-end encrypted by default, and built around an open protocol that any AI app can implement.

> Status: pre-alpha. Protocol v0.1 draft and TypeScript SDK v0.0.x in active development. Not yet ready for production use.

---

## Why mneme

Every existing AI memory product — Mem0, Letta, Zep, ChatGPT Memory, Claude Projects — stores your data on **their** servers in **their** schema, locked to **their** product. mneme is the structural inverse:

| | Existing memory products | **Mneme** |
| --- | --- | --- |
| Where memory lives | Their servers | Your device, synced anywhere |
| Who holds the keys | They do | You only |
| Schema | Proprietary, closed | Open protocol, versioned spec |
| Provider coupling | Tied to one model / cloud | Works across every model |
| What happens if you leave | "Export" to a dead file | Take your encrypted store anywhere |

We compete on **whose memory it is**, not on whose retrieval scores half a point higher.

## Repository layout

```
mneme/
├── packages/             ← Libraries published to npm
│   ├── protocol/         ← @mneme/protocol — the open spec, as types
│   ├── sdk/              ← @mneme/sdk — TypeScript reference implementation
│   └── embedder-local/   ← @mneme/embedder-local — on-device embeddings via transformers.js
├── apps/              ← Deployable surfaces (API, MCP server, consumer app, …)
├── docs/
│   └── protocol/      ← Versioned Mneme Protocol spec
├── decisions/         ← Architecture Decision Records (ADRs)
├── prompts/           ← Versioned prompts used by the SDK / agents
├── brand/             ← Brand system: mark, tokens, type, voice (see brand/README.md)
├── tests/conformance/ ← Cross-implementation protocol conformance suite
└── .github/workflows/ ← CI
```

The boundary between `packages/protocol` and everything else is the boundary we publish as the **mneme Protocol** — a versioned, open spec at `docs/protocol/`.

## Quickstart

```ts
import { Mneme } from '@mneme/sdk'
import { LocalEmbedder } from '@mneme/embedder-local'

const mneme = await Mneme.open({
  passphrase: 'correct horse battery staple', // optional — encrypts at rest
  embedder: new LocalEmbedder(),              // optional — enables semantic recall
})

await mneme.remember({
  kind: 'preference',
  body: 'Prefers concise code review comments',
})

// Body is sealed with AES-256-GCM on disk; "feedback style" never appears in
// any column. Semantic recall finds it anyway because embeddings are computed
// pre-encryption.
const matches = await mneme.recall('feedback style on pull requests')
```

Both options are independent and opt-in. `new Mneme()` (sync) still works for plaintext local mode. `Mneme.open({ passphrase })` requires the async factory and persists ciphertext at rest under Argon2id-derived master keys. `@mneme/embedder-local` is an optional companion package for on-device semantic search.

## For contributors

Requires [Bun](https://bun.sh) `>= 1.3`. Once cloned:

```sh
bun install
bun test
bun run typecheck
bun run lint
```

## Project documents

- [`BRIEF.md`](./BRIEF.md) — product thesis, ICP, SKU lineup, go-to-market
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — full technical design
- [`docs/protocol/`](./docs/protocol/) — public, versioned spec
- [`decisions/`](./decisions/) — ADRs for non-trivial decisions
- [`brand/README.md`](./brand/README.md) — brand system: mark, palette, type, voice

## License

Apache 2.0. See [`LICENSE`](./LICENSE).
