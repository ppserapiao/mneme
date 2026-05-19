# @mnemehq/mcp-server

Model Context Protocol server for **mneme** — exposes the user-sovereign memory layer as MCP tools so any MCP host (Claude Code, Claude.ai, Cursor, future Anthropic agents) can remember, recall, forget, and supersede memory on the user's behalf.

> Status: `v0.1.0` — first npm release. Wraps `@mnemehq/sdk` v0.1.0. Runs as a stdio MCP server.

## Install in Claude Code

The fastest path — one command, no clone, no install:

```sh
claude mcp add mneme -- npx -y @mnemehq/mcp-server
```

That registers the server, fetches the published tarball on first run, and starts speaking JSON-RPC over stdio. The `-y` keeps npx from prompting.

Or add the equivalent stanza to `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "mneme": {
      "command": "npx",
      "args": ["-y", "@mnemehq/mcp-server"]
    }
  }
}
```

For encryption at rest, pass a passphrase via env:

```json
{
  "mcpServers": {
    "mneme": {
      "command": "npx",
      "args": ["-y", "@mnemehq/mcp-server"],
      "env": {
        "MNEME_PASSPHRASE": "correct horse battery staple"
      }
    }
  }
}
```

Requires [Bun](https://bun.sh) `>= 1.3` on the PATH (the server uses `bun:sqlite`). Bun is also what `npx` runs the shebanged entry under.

### Local development / contributor mode

To run from a checkout instead of npm:

```sh
git clone https://github.com/ppserapiao/mneme
cd mneme
bun install

claude mcp add mneme bun -- run apps/mcp-server/src/index.ts
```

The first time the server runs with a passphrase against a fresh store, it prints the **24-word recovery phrase** to stderr exactly once. Save it — losing both the passphrase and the recovery phrase loses the store permanently.

## Environment variables

| Var                  | Default                                       | Notes |
| -------------------- | --------------------------------------------- | ----- |
| `MNEME_STORE_PATH`   | platform-appropriate (`Mneme/memory.sqlite`)  | SQLite file path |
| `MNEME_OWNER_ID`     | `local`                                       | Logical owner id used for every verb |
| `MNEME_PASSPHRASE`   | unset (plaintext)                             | When set, enables AES-256-GCM encryption at rest |

## Tools exposed

| Tool                 | What it does                                                                       |
| -------------------- | ---------------------------------------------------------------------------------- |
| `mneme_remember`     | Persist a new memory (`kind`, `body`, optional `sourceApp`, `tags`, `confidence`)  |
| `mneme_recall`       | Natural-language search; returns ranked records with scores                        |
| `mneme_get`          | Fetch a single record by ULID                                                      |
| `mneme_forget`       | Mark a record forgotten (soft by default; `hard: true` schedules hard delete)      |
| `mneme_supersede`    | Atomically replace a record with a new one; old is linked via `supersededBy`       |
| `mneme_export`       | Stream every record for the current owner (including superseded / expired)         |

Every handler returns its result as a single JSON-stringified text content block. Errors come back with `isError: true` and a `{ error: { code, message } }` body so the model and the user both see a clear failure.

## Security notes

- The server is stdio-only. There is no inbound network listener.
- In encrypted mode the SQLite file contains zero plaintext bodies. The MCP transport (JSON-RPC over stdio) sees plaintext only for the duration of a request/response.
- Stdout is reserved for JSON-RPC. Anything informational (recovery phrase, startup banner, errors) is written to stderr.
- A single passphrase per server process; per-app or per-owner key separation is a future feature.

## Roadmap

- Embedder configuration via env (defer until Bun + onnxruntime cleanup crash is resolved, ADR 0004 §4)
- HTTP transport in addition to stdio (for browser MCP hosts)
- Per-tool annotations exposing read-only / destructive hints to the host

## License

Apache-2.0.
