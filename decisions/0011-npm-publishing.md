# 0011 — npm publishing strategy

**Status**: Accepted
**Date**: 2026-05-19

## Context

Through v0.0.8 every shipping artifact lived inside the monorepo. Trying mneme has been a "git clone" exercise — fine for early design-partner conversations but a real wall in front of broader outreach. Every "have you seen mneme?" Slack message would need a clone-and-bun-install reply, which kills the activation curve.

v0.0.9 closes that gap by getting the five user-facing packages onto npm. After this PR lands and Pedro runs the actual publish commands, any developer in the world can:

```sh
bun add @mnemehq/sdk @mnemehq/sync-websocket    # SDK + network transport
bun add @mnemehq/embedder-local                # optional embeddings
npx @mnemehq/mcp-server                        # MCP server in Claude Code
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

From here on, each package versions independently. A passphrase-rotation API change on `@mnemehq/sdk` doesn't force `@mnemehq/protocol` to bump. Changesets (deferred — see §5) will manage this once published versions diverge.

The monorepo git tag continues to track the *whole-repo state*: v0.0.8 → **v0.1.0** for this PR to match the coordinated bump.

### 3. `publishConfig` to swap exports between dev and published

Inside the workspace we want `@mnemehq/sdk` to resolve to `src/index.ts` directly — fast iteration, TypeScript-native, no build step required for `bun test`. When consumers install the package from npm we want them to get `dist/index.js` + `dist/index.d.ts`, no TypeScript source.

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
| `packages/protocol` | `@mnemehq/protocol` | Open spec types + Zod schemas. Foundational. |
| `packages/sdk` | `@mnemehq/sdk` | Reference TypeScript SDK. The main install. |
| `packages/embedder-local` | `@mnemehq/embedder-local` | Optional on-device embeddings. |
| `packages/sync-websocket` | `@mnemehq/sync-websocket` | WebSocket transport for sync + pairing. |
| `apps/mcp-server` | `@mnemehq/mcp-server` | MCP server with `bin: mneme-mcp`, runnable via `npx @mnemehq/mcp-server`. |

Stays private (not published):

- `tests/conformance` — internal test harness.
- The monorepo itself (`mneme` root `package.json` is `"private": true`).

### 5. Manual publish first, Changesets later

For the first publish, Pedro runs `npm publish` for each package in topological order (`protocol` → `sdk` → `embedder-local` / `sync-websocket` / `mcp-server`). The procedure is documented in `CLAUDE.md` under "Publishing to npm" so future sessions can repeat it.

Changesets land in a follow-up ADR once the cadence picks up. The pattern: PR drafts a changeset alongside the code change; CI verifies the changeset; merge to main → GitHub Action runs `changeset publish`. Not worth setting up before the first manual publish proves the build artefacts are correct.

### 6. NPM scope — `@mnemehq` (not `@mneme`)

The original plan was to publish under the bare `@mneme` scope. On 2026-05-19, while creating the npm organisation, we discovered the username **`mneme` is already held by an unrelated npm user with four published packages**. npm uses a shared namespace for users and orgs — the existing user permanently blocks `@mneme` as an org scope. Filing a name dispute with npm support is not viable: their disputes policy requires trademark infringement or active malicious squatting, neither of which apply to a small, long-established user. Buying the name would mean weeks of cold outreach with no guarantee.

We pivoted to **`@mnemehq`** for these reasons:

- **One word, no hyphen.** `@mneme-co`, `@mneme-dev`, `@mneme-ai` all parse as "mneme, with a modifier"; `@mnemehq` parses as "the mneme org," which is closer to the brand reading.
- **Established convention.** When a bare brand name is taken on npm, the `<brand>hq` pattern is the most common next move. Notion uses `@notionhq` (e.g. `@notionhq/client`); other infra projects follow the same pattern. Familiar to developers, non-cringe.
- **Doesn't bake positioning into the install command.** `@mneme-ai` would tell consumers "this is for AI" — true but not our differentiator. We compete on user-sovereignty / local-first / open-protocol, not on the "AI" label.
- **Future-proof against domain choices.** If we eventually buy `mneme.dev` or `mneme.io`, the npm scope still reads correctly. A hyphenated `@mneme-ai` scope would feel awkward.

The brand text remains `mneme` everywhere in running copy (per `brand/README.md`). The npm scope `@mnemehq` is operational infrastructure only — analogous to how Vercel's brand is "Vercel" but their npm scope mixes `@vercel` (the bare scope they were lucky to get) with `@vercel-labs` (when they need a second namespace).

Org admin facts:

- Org `mnemehq` on npmjs.com, Free plan (unlimited public packages).
- The publishing user is `nmene` (Pedro's existing personal npm account — username unrelated to the scope, invisible to consumers). 2FA in "auth and writes" mode is required before any publish.
- Until packages are actually pushed, scope ownership is reversible only via deleting the org and creating a different one. Once the first package is published the scope is effectively permanent.

## Consequences

Positive:

- Every onboarding conversation drops the "clone the repo" friction. `bun add @mnemehq/sdk` and the snippets in the README just work.
- `npx @mnemehq/mcp-server` becomes the instant Claude Code install — closer to one-line distribution.
- Per-package versioning unblocks fixing a bug in `@mnemehq/sync-websocket` without forcing every other package to re-release.
- The build artefacts are also runtime artefacts — anyone reading the npm tarball gets readable `dist/index.js` (we don't minify libraries; we let bundlers downstream do that). Inspectability is preserved.

Negative:

- Adds a build step to every release cycle. `bun run --filter '*' build` takes a few seconds and must be done before `npm publish`.
- `publishConfig` is a subtle source of "works in dev, breaks on consume" bugs if it falls out of sync with the regular exports. Mitigated by treating both `exports` blocks as parallel: any field added to one is added to the other, both verified by typecheck.
- Manual first publish has rollback risk — if a published artefact is broken we have 72 hours to `npm unpublish`, beyond that we're stuck shipping a fix-version. Reviewer (Pedro) verifies build output before publishing.
- We're now on the npm-name hook for `@mnemehq/*`. Anyone else who tries to register the scope is blocked once we publish the first package.

## Alternatives considered

- **Use one omnibus package `@mnemehq/mneme` exposing everything.** Tempting for ergonomics. Rejected because the per-package boundaries reflect real architectural separation (protocol vs SDK vs embedder vs transport vs MCP server) and consumers should opt into only what they need.
- **Fight for the bare `@mneme` scope.** Filing a dispute with npm support or contacting the current owner. Rejected as time-unbounded — npm's disputes policy doesn't grant names to projects that share a word with an existing user. Reconsider only if mneme later trademarks the name and the current user is provably squatting.
- **Pivot to a different scope shape: `@mneme-ai`, `@mneme-dev`, `@usemneme`, `@mneme-co`.** Considered. Rejected in favour of `@mnemehq` for the reasons in §6 (one word, established convention, doesn't bake positioning into the install command).
- **Publish under `@ppserapiao/*` first to validate the flow.** Considered but ugly — we'd have to re-publish under `@mnemehq/*` later. Better to set up the org once and publish under the real name.
- **Use JSR (Deno's package registry) in addition to npm.** Real consideration — JSR has nice TypeScript-native publishing. Deferred to v0.1.x once npm is established.
- **Bundle each package into a single file.** Considered — gives smaller install for consumers. Rejected for v0.1.0: keeping `dist/` close to the source structure makes debugging easier and Bun's loader handles many files efficiently. We can revisit if install size becomes a real complaint.
- **Set up CI publishing now via Changesets.** Considered. Deferred to keep this PR scoped to "get one publish working." Changesets gets its own ADR when the first set of mid-PR version bumps comes through.
