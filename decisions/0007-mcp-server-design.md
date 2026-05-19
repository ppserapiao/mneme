# 0007 — MCP server design

**Status**: Accepted
**Date**: 2026-05-19

## Context

The brief identifies the **MCP server** as the cheapest credible distribution channel mneme has in 2026 — every Claude Code user who installs it becomes a mneme user (BRIEF.md §"Go-to-market wedge"). With v0.0.4 the SDK gained the last load-bearing foundation it needed (encryption envelope, BIP-39 recovery, Ed25519 signed writes), so the MCP server is now a thin shim rather than a thing that has to wait for more primitives.

The constraints shaping this PR:

1. **Cheapest possible distribution.** A user must be one line away from installing in Claude Code. The server therefore runs over stdio (Claude Code's default transport), reads config from env, has zero interactive setup steps.
2. **Stay inside the doc-lockstep rule (CLAUDE.md §1).** The MCP server is a new public surface, so it needs its own README + ADR + entry in the root README + decisions index update — same PR.
3. **No new crypto primitives.** Encryption, recovery, and signing are all in the SDK. The MCP server only wires env-supplied passphrase into `Mneme.initialize` / `Mneme.open` and never sees plaintext beyond what the host model gives it.
4. **Stdout is sacred.** The MCP transport is JSON-RPC 2.0 over stdout/stdin. Any informational output (banner, recovery phrase, errors) MUST go to stderr or it corrupts the protocol stream.

## Decision

### Package layout

`apps/mcp-server` per ADR 0001 (`apps/` = deployable surfaces). Published as `@mnemehq/mcp-server` when we begin npm publishing — until then run directly via `bun run apps/mcp-server/src/index.ts`.

```
apps/mcp-server/
├── package.json         # @mnemehq/mcp-server, depends on @mnemehq/sdk + @modelcontextprotocol/sdk + zod
├── tsconfig.json
├── README.md            # one-line Claude Code install
└── src/
    ├── index.ts         # entry: build server + stdio transport
    ├── server.ts        # McpServer setup, tool registration
    ├── tools.ts         # handler implementations, Zod schemas, types
    ├── config.ts        # env var parsing
    └── tools.test.ts    # handler tests against an in-memory Mneme
```

### Tool naming and surface

Six tools, one per SDK verb, all prefixed `mneme_` so they don't collide with other MCP tools in the same host:

| Tool name           | Wraps                       |
| ------------------- | --------------------------- |
| `mneme_remember`    | `mneme.remember(input)`     |
| `mneme_recall`      | `mneme.recall(query, opts)` |
| `mneme_get`         | `mneme.get(id)`             |
| `mneme_forget`      | `mneme.forget(id, opts)`    |
| `mneme_supersede`   | `mneme.supersede(id, repl)` |
| `mneme_export`      | `mneme.exportAll()`         |

We deliberately do NOT expose `Mneme.initialize` / `Mneme.open` / `Mneme.publicKey` as tools — those are setup operations, not memory operations. Keyring management belongs in env config and the consumer app, not in a chat-driven tool surface.

### Input validation

Each tool's `inputSchema` is a Zod shape constructed from the SDK's existing primitives (`MEMORY_KINDS` for the kind enum, ULID regex for IDs, bounded string lengths, etc.). The MCP SDK runs Zod validation before calling the handler, so malformed model arguments surface a clear "invalid arguments" error to the host before reaching `@mnemehq/sdk`.

### Error mapping

Every handler is wrapped in a single `try` / `catch` that produces a CallToolResult with `isError: true` and a `{ error: { code, message } }` body. `MnemeError`s preserve their `code`; other errors come through as `{ error: { message } }`. The host model sees an error block in the same content channel as success, which is the MCP convention.

We do not throw all the way out to the transport (which would close the connection on a single bad call) — every handler always returns a CallToolResult.

### Encryption configuration

Encryption is **opt-in** via `MNEME_PASSPHRASE`. The boot logic:

1. If `MNEME_PASSPHRASE` is unset → `new Mneme()` (plaintext).
2. If set and a keyring exists → `Mneme.open({ passphrase })`. Wrong passphrase aborts startup with a clear stderr error.
3. If set and no keyring exists → `Mneme.initialize({ passphrase })`. The 24-word recovery phrase is **printed to stderr exactly once** with a clear banner. We accept that stderr scrollback can leak the phrase (the user's responsibility); the alternative (an interactive prompt or a separate channel) doesn't fit the stdio MCP-server-as-subprocess model.

Three additional env vars round out config:

- `MNEME_STORE_PATH` — override the default SQLite location.
- `MNEME_OWNER_ID` — logical owner id for every verb (default `local`).

Embedder configuration is deliberately deferred — the Bun + onnxruntime-node cleanup crash (ADR 0004 §4) interacts badly with a long-running MCP daemon. We will add `MNEME_EMBEDDER=local|voyage` when upstream lands a fix or we add a WASM fallback.

### Why we picked the official `@modelcontextprotocol/sdk`

- It's the reference implementation and tracks the spec authoritatively. Zero risk of drifting from real MCP semantics.
- `McpServer.registerTool` provides automatic Zod-based input validation, so we don't reinvent JSON-Schema generation.
- Built-in stdio transport. We swap it for HTTP later by changing one import.

The cost is a dep on the SDK's transitive zod version (we pin `zod@^3.23` to match the SDK and the protocol package); negligible.

## Consequences

Positive:

- Claude Code users can try mneme tonight with a one-line install. The brand promise (encryption + recovery + signed provenance + on-device by default) is finally something a developer can experience inside an actual host instead of a README.
- The MCP server validates the SDK's API surface against a real consumer. Where the SDK is awkward, the MCP wrapper exposes it immediately.
- The protocol now has a third surface that depends on it (after the SDK and the conformance suite), reinforcing the boundary.
- `apps/mcp-server` is the first thing actually in `apps/` — proves the monorepo layout decision (ADR 0001) holds up.

Negative:

- Stderr recovery-phrase output is the weakest link in encrypted mode. Users who scroll back through Claude Code logs can re-see the phrase. Acceptable trade for v0.0.5; future work could pipe it through a host-side "show once" elicitation flow once that lands in the MCP spec.
- No embedder support yet — semantic recall is unavailable through the MCP surface in v0.0.5. Lexical recall still works in plaintext mode but is disabled under encryption (correctly, per ADR 0006).
- The server holds the master key in memory for as long as the Claude Code session lives. Same trust boundary as any local app process; documented in the README.
- Bun-only runtime today. Node compatibility for the entry script lands when we ship the SDK to npm.

## Alternatives considered

- **Hand-rolled JSON-RPC implementation.** Rejected — re-implements the spec, risks drift, no real benefit. Boring tech where it doesn't matter (CLAUDE.md §"non-negotiable standards").
- **HTTP transport in v0.0.5.** Stdio is enough for Claude Code / Claude.ai today; HTTP adds bind ports, auth, CORS — all distractions. Future ADR.
- **One mega `mneme` tool with an `action` parameter.** Would hide tool boundaries from the host's tool catalogue and confuse the model's tool-selection prompt. Six small tools is the idiomatic MCP shape.
- **Interactive prompt for the passphrase + recovery phrase.** Inappropriate for a daemon spawned by another process. Env var + one-time stderr print is the right primitive.
- **Refuse to start without a passphrase (force encryption).** Tempting for the brand story, but kills the "try it in 30 seconds" install. Plaintext-by-default lowers the activation cost; users self-select into encryption when they want it.
- **Skip the ADR for v0.0.5.** Would violate CLAUDE.md §1 (doc-lockstep) and §3 (ADR for non-trivial decisions). The MCP server is a new public surface — exactly what ADRs are for.
