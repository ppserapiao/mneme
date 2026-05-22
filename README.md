# mneme

**The open, user-sovereign memory layer for AI.**

Your memory. Your keys. Every model. mneme is local-first by design, end-to-end encrypted by default, and built around an open protocol that any AI app can implement.

[Website](https://mneme-web-zeta.vercel.app) · [Discussions](https://github.com/ppserapiao/mneme/discussions) · [Security](./SECURITY.md) · [Contributing](./CONTRIBUTING.md) · [@ptengelmann](https://x.com/ptengelmann)

> Status: public beta. Protocol v0.1, SDK shipping on npm, dual-matcher benchmark live. Not yet ready for production-critical use.

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

> Mem0 helps agents remember users. mneme helps users own their memory.

## What we've measured

100 samples across six everyday contexts (slack, journal, meeting notes, personal chat, domain-specific, edge cases). Same models on both sides. Scored two ways: strict keyword match against expected facts, and an independent LLM judging semantic equivalence.

| | mneme | [Mem0](https://github.com/mem0ai/mem0) v3.0.3 | Δ |
| --- | ---: | ---: | ---: |
| Semantic F1 (LLM judge) | 78.1% | 78.5% | tied |
| Strict F1 (keyword) | **62.4%** | 8.5% | **+53.9 pts** |

What this shows: at the content level mneme and Mem0 are effectively tied — both extract roughly the same underlying facts and the judge can't reliably tell them apart. The 53.9-point strict-match gap is **structural**: Mem0 paraphrases inputs into its own canonical form; mneme preserves the user's source language. Source preservation is what makes the next three things possible:

- **Citations.** Surfaced memories trace back to what was actually said.
- **Audit.** Compliance teams can verify the store against the source.
- **Reproducibility.** Strict keyword match is deterministic; semantic similarity drifts as judge models improve.

This is why "tied on semantic, ahead on strict" is the story we want — not "we beat Mem0 by N points." Mem0 can keep improving on semantic accuracy and we will too, but **the trust layer — faithful extraction, encryption at rest, user-held keys, portable across models — is structural to how mneme is built and isn't a parameter the alternative architectures can tune.**

Methodology: dual-matcher evaluation in [ADR 0014](./decisions/0014-eval-judge-mode.md); comparative-eval architecture in [ADR 0015](./decisions/0015-comparative-eval.md). Reproduce locally:

```sh
# Requires Docker (Qdrant) + ANTHROPIC_API_KEY + OPENAI_API_KEY
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
bun run eval:baseline -- --distiller=mem0 --judge=claude
```

Raw baseline artefacts (per-category breakdowns, judge transcripts, JSON reports) ship under [`tests/eval/baselines/`](./tests/eval/baselines/). Letta and Zep adapters land next.

## Repository layout

```
mneme/
├── packages/             ← Libraries published to npm
│   ├── protocol/         ← @mnemehq/protocol — the open spec, as types
│   ├── sdk/              ← @mnemehq/sdk — TypeScript reference implementation
│   ├── embedder-local/   ← @mnemehq/embedder-local — on-device embeddings via transformers.js
│   └── sync-websocket/   ← @mnemehq/sync-websocket — WebSocket transport for sync + pairing
├── apps/
│   └── mcp-server/       ← @mnemehq/mcp-server — Model Context Protocol server for Claude Code et al.
├── docs/
│   └── protocol/      ← Versioned Mneme Protocol spec
├── decisions/         ← Architecture Decision Records (ADRs)
├── prompts/           ← Versioned prompts used by the SDK / agents
├── brand/             ← Brand system: mark, tokens, type, voice (see brand/README.md)
├── tests/conformance/ ← Cross-implementation protocol conformance suite
└── .github/workflows/ ← CI
```

The boundary between `packages/protocol` and everything else is the boundary we publish as the **mneme Protocol** — a versioned, open spec at `docs/protocol/`.

## Install

```sh
# Core SDK
bun add @mnemehq/sdk

# Optional on-device embeddings
bun add @mnemehq/embedder-local

# Optional WebSocket transport for multi-device sync + pairing
bun add @mnemehq/sync-websocket

# Optional LLM-powered memory extraction (bring your own Anthropic key)
bun add @mnemehq/distiller-claude

# MCP server for Claude Code / Cursor / any MCP host — no install required
npx @mnemehq/mcp-server
```

All packages are published to npm under `@mnemehq/*`. Requires [Bun](https://bun.sh) `>= 1.3` at runtime (the SDK and transports use `bun:sqlite` and Bun-native WebSockets).

## Quickstart

```ts
import { Mneme } from '@mnemehq/sdk'
import { LocalEmbedder } from '@mnemehq/embedder-local'

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
for (const { record, score } of matches) {
  console.log(score.toFixed(2), record.kind, '—', record.body.data)
}

// Subsequent opens — passphrase or recovery phrase, both unlock the same store
// const mneme = await Mneme.open({ path: './mneme.sqlite', passphrase: '…' })
// const mneme = await Mneme.open({ path: './mneme.sqlite', recoveryPhrase: 'word word …' })
```

Every concern — encryption, recovery, semantic recall, multi-device sync, device pairing — is independent and opt-in.

- **`new Mneme()`** (synchronous constructor) gives you a plaintext local store. Useful for dev; not for production.
- **`Mneme.initialize({ passphrase, embedder })`** creates a new encrypted store and returns the BIP-39 recovery phrase **once**. Show it to the user; don't store it.
- **`Mneme.open({ passphrase })`** or **`Mneme.open({ recoveryPhrase })`** unlocks an existing encrypted store.
- **`mneme.beginPairing()`** + **`acceptPairing(invite, ...)`** (imported from `@mnemehq/sdk`) move the master key from one device to another with a user-verified Short Authentication String (SAS) — a 6-emoji/word string that both devices must confirm match. Defends against MITM.
- **`mneme.sync(peer)`** converges two stores via any transport implementing the `SyncPeer` interface (`InProcessSyncPeer` ships with the SDK; `WebSocketSyncPeer` ships separately).
- **`@mnemehq/embedder-local`** is the optional companion package for on-device semantic recall.

### Use it from Claude Code (MCP)

```sh
claude mcp add mneme -- npx -y @mnemehq/mcp-server
```

Now `mneme_remember`, `mneme_recall`, `mneme_get`, `mneme_forget`, `mneme_supersede`, `mneme_export` are available as MCP tools in Claude Code. See [`apps/mcp-server/README.md`](./apps/mcp-server/README.md) for the encrypted-mode setup.

### Sync across two laptops over a LAN

```ts
// On device A
import { Mneme } from '@mnemehq/sdk'
import { WebSocketSyncServer, serveForPairing } from '@mnemehq/sync-websocket'

const alice = await Mneme.open({ passphrase: '...' })
await serveForPairing(alice, {
  onUrlReady: (url) => console.log(`Pair to ${url}`),
  onSasReady: async (sas) => userConfirms(sas), // your UI
})

// Once paired, expose alice for sync
const server = new WebSocketSyncServer({ mneme: alice, allowedOwnerId: 'pedro' })
server.start()
```

```ts
// On device B
import { Mneme } from '@mnemehq/sdk'
import { WebSocketSyncPeer, pairOverWebSocket } from '@mnemehq/sync-websocket'

const { mneme: bob } = await pairOverWebSocket({
  url: 'ws://192.168.1.10:7078',
  passphrase: 'bob-passphrase',
  path: '/path/b.sqlite',
  onSasReady: async (sas) => userConfirms(sas),
})

await bob.sync(new WebSocketSyncPeer({ url: 'ws://192.168.1.10:7077' }))
```

See [`packages/sync-websocket/README.md`](./packages/sync-websocket/README.md) for the full transport flow + security notes.

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
