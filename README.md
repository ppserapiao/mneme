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
├── apps/
│   └── mcp-server/       ← @mneme/mcp-server — Model Context Protocol server for Claude Code et al.
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

// First time — get the recovery phrase, store it somewhere safe
const { mneme, recoveryPhrase } = await Mneme.initialize({
  passphrase: 'correct horse battery staple',
  embedder: new LocalEmbedder(),
})
console.log('SAVE THIS:', recoveryPhrase) // 24 words, shown once

await mneme.remember({
  kind: 'preference',
  body: 'Prefers concise code review comments',
})

// Body is sealed with AES-256-GCM on disk and signed with Ed25519.
// Semantic recall finds it via embeddings computed pre-encryption.
const matches = await mneme.recall('feedback style on pull requests')

// Subsequent opens — passphrase or recovery phrase, both unlock the same store
// const mneme = await Mneme.open({ passphrase: 'correct horse battery staple' })
// const mneme = await Mneme.open({ recoveryPhrase: 'word word word …' })
```

All three concerns — encryption, recovery, semantic recall — are independent and opt-in. `new Mneme()` (sync) still works for plaintext local mode. `Mneme.initialize()` creates a new encrypted store and returns the BIP-39 recovery phrase once. `Mneme.open()` unlocks an existing store with either the passphrase or the recovery phrase. `@mneme/embedder-local` is an optional companion package for on-device semantic search.

### Use it from Claude Code (MCP)

```sh
git clone https://github.com/ppserapiao/mneme
cd mneme
bun install

claude mcp add mneme bun -- run apps/mcp-server/src/index.ts
```

Now `mneme_remember`, `mneme_recall`, `mneme_get`, `mneme_forget`, `mneme_supersede`, `mneme_export` are available as MCP tools in Claude Code. See [`apps/mcp-server/README.md`](./apps/mcp-server/README.md) for the encrypted-mode setup.

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
