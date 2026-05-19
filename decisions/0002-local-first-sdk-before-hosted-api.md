# 0002 — Local-first SDK before hosted API

**Status**: Accepted
**Date**: 2026-05-19

## Context

The eight-week MVP timeline in [`ARCHITECTURE.md §14`](../ARCHITECTURE.md#14-the-eight-week-mvp-timeline) opens with repo skeleton in week 1, then a hosted Postgres-backed API in week 2, with the TypeScript SDK and encryption arriving later. That ordering is sensible for a typical hosted SaaS, where developer adoption depends on a callable endpoint.

It is the wrong ordering for mneme. Our entire structural thesis — user-sovereign, local-first, no vendor lock-in — turns into marketing copy rather than DNA if the first running artifact is a hosted endpoint behind an account system. Once the API exists, it becomes the default in everyone's mental model, and local-first becomes "a thing we added later." That is the trap Mem0 / Letta / Zep set for themselves and that we are deliberately structured to avoid.

The first artifact a design partner can hold in their hands shapes how the product is perceived for years.

## Decision

Reorder the first three weeks of the published timeline:

1. **Week 1** — Monorepo skeleton, `@mnemehq/protocol` (canonical types + Zod schemas), `@mnemehq/sdk` v0.0.1 (local-only SQLite-backed `Mneme` class with `remember/recall/forget/supersede`), protocol v0.1 draft, brand integration, CI.
2. **Week 2** — Encryption envelope (AES-256-GCM body, master-key derivation, signing keys), `@mnemehq/embedder-local` and `@mnemehq/embedder-voyage`, MCP server scaffold against the local SDK.
3. **Week 3** — Hosted backend (`apps/api`) on Postgres + pgvector, exposing the same protocol. The hosted API ships as *one of several sync targets*, not as "the" Mneme.

The CLAUDE.md / ARCHITECTURE.md tech stack choices are otherwise unchanged. Fly.io / WorkOS / Postgres slot in at week 3 when we actually need them.

## Consequences

Positive:
- The first artifact a developer installs (`bun add @mnemehq/sdk`) runs entirely on their machine, against a SQLite file they own. Local-first is felt, not claimed.
- We can recruit design partners on a real working SDK in week 1 instead of a deployed-but-empty hosted endpoint.
- The hosted API in week 3 is built against a stable SDK contract, which forces clean boundaries.
- We defer the Fly.io / WorkOS / Postgres bring-up by ~2 weeks, saving infrastructure cost while the product surface is still in flux.

Negative:
- We do not have a public hosted endpoint at the end of week 1. Outreach materials that need "try it now in your browser" must wait or use a hosted SDK playground (acceptable trade).
- The SDK ships before encryption (v0.0.1 stores plaintext bodies in SQLite). This is loudly documented in the SDK README and gated to local-only mode; production stores in v0.2+ reject plaintext payloads via the `unsupported_payload_mode` error.
- Slight schedule risk if encryption (week 2) slips — the SDK would remain plaintext-only longer than ideal.

## Alternatives considered

- **Follow the published timeline as-is**. Rejected for the reasons in §Context: shipping the hosted API first quietly turns us into another Mem0 architecturally, even though we describe ourselves as local-first.
- **Ship encryption in week 1 alongside the SDK**. Rejected — combining encryption envelope, key derivation, multi-device key wrapping, recovery phrases, and the SDK API surface in one week risks shipping none of them well. Splitting buys us focus.
- **Ship local SDK and hosted API in parallel in week 1**. Rejected — same focus argument. Two surfaces, two contracts, two operational concerns. We pick the one that anchors the thesis and let the other follow.
