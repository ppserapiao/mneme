# 0011 — npm publishing strategy

**Status**: Accepted
**Date**: 2026-05-19

## Context

Through v0.0.8 every shipping artifact lived inside the monorepo. Trying mneme has been a "git clone" exercise — fine for early design-partner conversations but a real wall in front of broader outreach. Every "have you seen mneme?" Slack message would need a clone-and-bun-install reply, which kills the activation curve.

v0.0.9 closes that gap by getting the five user-facing packages onto npm. After this PR lands and Pedro runs the actual publish commands, any developer in the world can:

```sh
bun add @mneme/sdk @mneme/sync-websocket    # SDK + network transport
bun add @mneme/embedder-local                # optional embeddings
npx @mneme/mcp-server                        # MCP server in Claude Code
```

This ADR locks five decisions: build tool, version coordination, the dual src/dist exports pattern, what we publish vs keep private, and the publish flow itself (manual first, automated later).

## Decision

### 1. Build tool — `tsdown`

`tsdown` is the Rolldown-based successor to `tsup` from the same author chain that built Vite. Fast, modern, sensible defaults, first-class `.d.ts` generation. Each publishable package gets a `build` script that invokes `tsdown` over `src/index.ts`, producing `dist/index.js` (ESM) plus `dist/index.d.ts`.

Rejected alternatives:

- **Raw `tsc`** — works but produces unbundled `.js` per source file, no shebang handling for `mcp-server`, slower.
- **`tsup`** — established and reliable; chose `tsdown` because it's the actively-developed successor and is meaningfully faster.
- **`bun build`** — Bun's bundler. Capable but `.d.ts` story is not as polished today.

### 2. Per-package versioning, coordinated jump to `0.1.0`

Every publishable package was sitting at `0.0.1` in `package.json`. For the first npm publication, all five jump to **`0.1.0`** in lockstep. The signal: "this is the first published version, the API surface is real but pre-1.0 so it may still break across minors."

From here on, each package versions independently. A passphrase-rotation API change on `@mneme/sdk` doesn't force `@mneme/protocol` to bump. Changesets (deferred — see §5) will manage this once published versions diverge.

The monorepo git tag continues to track the *whole-repo state*: v0.0.8 → **v0.1.0** for this PR to match the coordinated bump.

### 3. `publishConfig` to swap exports between dev and published

Inside the workspace we want `@mneme/sdk` to resolve to `src/index.ts` directly — fast iteration, TypeScript-native, no build step required for `bun test`. When consumers install the package from npm we want them to get `dist/index.js` + `dist/index.d.ts`, no TypeScript source.

`publishConfig` in `package.json` is the npm-native way to override fields *only* at publish time:

```json
{
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "files": ["src", "dist", "README.md", "LICENSE"],
  "publishConfig": {
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}
```

Workspace dev: source-mode resolution. Published package: dist-mode resolution. No `prepublishOnly` magic needed beyond making sure `dist/` exists.

### 4. What we publish — five packages

| Package | npm name | Notes |
| --- | --- | --- |
| `packages/protocol` | `@mneme/protocol` | Open spec types + Zod schemas. Foundational. |
| `packages/sdk` | `@mneme/sdk` | Reference TypeScript SDK. The main install. |
| `packages/embedder-local` | `@mneme/embedder-local` | Optional on-device embeddings. |
| `packages/sync-websocket` | `@mneme/sync-websocket` | WebSocket transport for sync + pairing. |
| `apps/mcp-server` | `@mneme/mcp-server` | MCP server with `bin: mneme-mcp`, runnable via `npx @mneme/mcp-server`. |

Stays private (not published):

- `tests/conformance` — internal test harness.
- The monorepo itself (`mneme` root `package.json` is `"private": true`).

### 5. Manual publish first, Changesets later

For the first publish, Pedro runs `npm publish` for each package in topological order (`protocol` → `sdk` → `embedder-local` / `sync-websocket` / `mcp-server`). The procedure is documented in `CLAUDE.md` under "Publishing to npm" so future sessions can repeat it.

Changesets land in a follow-up ADR once the cadence picks up. The pattern: PR drafts a changeset alongside the code change; CI verifies the changeset; merge to main → GitHub Action runs `changeset publish`. Not worth setting up before the first manual publish proves the build artefacts are correct.

### 6. NPM scope (`@mneme`) ownership

The `@mneme` npm organisation needs to be created on npmjs.com. Pedro owns this (it's company-name-level). Until he creates it and grants publish rights, the build artefacts sit ready in `dist/` and the PR can be merged — but the actual `npm publish` step is gated on the npm account work.

## Consequences

Positive:

- Every onboarding conversation drops the "clone the repo" friction. `bun add @mneme/sdk` and the snippets in the README just work.
- `npx @mneme/mcp-server` becomes the instant Claude Code install — closer to one-line distribution.
- Per-package versioning unblocks fixing a bug in `@mneme/sync-websocket` without forcing every other package to re-release.
- The build artefacts are also runtime artefacts — anyone reading the npm tarball gets readable `dist/index.js` (we don't minify libraries; we let bundlers downstream do that). Inspectability is preserved.

Negative:

- Adds a build step to every release cycle. `bun run --filter '*' build` takes a few seconds and must be done before `npm publish`.
- `publishConfig` is a subtle source of "works in dev, breaks on consume" bugs if it falls out of sync with the regular exports. Mitigated by treating both `exports` blocks as parallel: any field added to one is added to the other, both verified by typecheck.
- Manual first publish has rollback risk — if a published artefact is broken we have 72 hours to `npm unpublish`, beyond that we're stuck shipping a fix-version. Reviewer (Pedro) verifies build output before publishing.
- We're now on the npm-name hook for `@mneme/*`. Anyone else who tries to register the scope is blocked once we publish the first package.

## Alternatives considered

- **Use one omnibus package `@mneme` exposing everything.** Tempting for ergonomics. Rejected because the per-package boundaries reflect real architectural separation (protocol vs SDK vs embedder vs transport vs MCP server) and consumers should opt into only what they need.
- **Publish under `@ppserapiao/*` first to validate the flow.** Considered but ugly — we'd have to re-publish under `@mneme/*` later. Better to set up the org once and publish under the real name.
- **Use JSR (Deno's package registry) in addition to npm.** Real consideration — JSR has nice TypeScript-native publishing. Deferred to v0.1.x once npm is established.
- **Bundle each package into a single file.** Considered — gives smaller install for consumers. Rejected for v0.1.0: keeping `dist/` close to the source structure makes debugging easier and Bun's loader handles many files efficiently. We can revisit if install size becomes a real complaint.
- **Set up CI publishing now via Changesets.** Considered. Deferred to keep this PR scoped to "get one publish working." Changesets gets its own ADR when the first set of mid-PR version bumps comes through.
