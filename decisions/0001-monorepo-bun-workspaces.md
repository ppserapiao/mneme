# 0001 — Monorepo with Bun workspaces

**Status**: Accepted
**Date**: 2026-05-19

## Context

The brief lays out an eight-SKU ecosystem fanning out from one core primitive: the open protocol + reference SDK. The lineup includes (at minimum) the protocol package, the TypeScript SDK, a Python SDK, a hosted API, an MCP server, a browser extension, a consumer desktop app, a marketing/docs site, and an enterprise control plane.

Many of these SKUs share types from `@mneme/protocol` and depend on each other (the MCP server wraps the SDK; the API serves the protocol; the consumer app embeds the SDK). When the protocol changes — and it will, repeatedly, on the path to v1.0 — we need atomic, all-stack refactors that update the spec, the schemas, the SDK, the API, the MCP server, and the docs in one commit.

We also need to ship this with a team of one human + one AI co-founder. Coordination tax is the binding constraint, not repo size.

The runtime is locked to Bun per `CLAUDE.md`. Bun has first-class workspace support.

## Decision

Single monorepo at the top of this repository, organised as:

```
mneme/
├── packages/   # importable libraries published to npm (@mneme/*)
├── apps/       # deployable surfaces (api, mcp-server, consumer, extension, web)
├── docs/       # public-facing documentation (including docs/protocol/ — the spec)
├── decisions/  # ADRs (this file's home)
├── prompts/    # versioned prompts
├── brand/      # brand system: mark, tokens, type, voice
└── tests/      # conformance + cross-cutting test packages
```

Packages and apps are Bun workspaces declared in the root `package.json`. Cross-workspace references use the `workspace:*` protocol. The root `tsconfig.json` uses TypeScript project references so each package builds independently and incrementally.

Frontend and backend code are physically separated under `apps/`. No app or package may import from another app. Cross-app sharing happens via `packages/`.

## Consequences

Positive:
- One atomic commit can land a protocol change end-to-end across spec, types, SDK, API, MCP server, and docs.
- Contributors see the entire ecosystem at a glance, which reinforces the "every SKU is a credible standalone product, together they're the category" thesis.
- Shared tooling — one Biome config, one TypeScript base config, one CI pipeline — keeps quality bars uniform.
- Adding a new SKU is a new folder, not a new repo.

Negative:
- Larger checkout for contributors who only care about one SKU.
- A misconfigured CI step can block unrelated work; we mitigate by per-package scripts and per-workspace test filtering.
- We will eventually want per-package release cadence; that adds Changesets or similar later (deferred until first npm publish).

## Alternatives considered

- **Single mixed package**. Rejected — collapses the SKU boundaries that are central to the product thesis, and conflates dependencies across very different surfaces (a browser extension does not need `bun:sqlite`).
- **Multiple repos** (e.g., `mneme-protocol`, `mneme-sdk`, `mneme-api`, …). Rejected — coordination tax across repos for a 1-human team is severe: type sync, version coordination, atomic refactors, and PR cascades. Going monorepo → split later is straightforward; going split → unified is excruciating. We can revisit if we hire a second contributor and they specifically need it.
- **pnpm or yarn workspaces over Bun**. Rejected — runtime is already Bun (faster dev loop, native SQLite without a build step, native test runner). Using a different package manager would introduce a second source of truth for dependencies.
