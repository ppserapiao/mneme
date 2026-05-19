# 0004 — Local-first embedding strategy

**Status**: Accepted
**Date**: 2026-05-19

## Context

`@mnemehq/sdk` v0.0.1 shipped with lexical search via SQLite FTS5 BM25 only. That works for keyword recall ("coffee" finds bodies containing "coffee") but fails the load-bearing test of a "memory layer for AI" — semantic recall, where the query and the stored memory share meaning without sharing words. A query like *"how does Pedro like feedback on PRs?"* must surface a memory body like *"prefers concise code review comments"*. BM25 alone cannot do that.

The thesis commits us to local-first and user-sovereign. The obvious commercial answer — a hosted embedding API like OpenAI `text-embedding-3-small` or Voyage — sends every memory to a third party and forces us to ship API key management to consumers. That breaks the "your data never leaves the machine" promise on the first interesting verb. We need embeddings that run on the user's device by default.

Three downstream constraints shape this:

1. **The SDK core must stay dependency-light.** Pulling `@huggingface/transformers` + `onnxruntime-node` into `@mnemehq/sdk` would more than double install size (~50 MB) for users who don't need semantic search.
2. **The choice of model partitions the data.** Embeddings from model A are not comparable to embeddings from model B; mixing them yields nonsense scores. Whatever we pick now becomes load-bearing.
3. **Bun + onnxruntime-node has a known cleanup crash.** As of Bun 1.3.14, loading the ONNX native addon causes a C++ exception on process exit even when tests pass. CI must remain green.

## Decision

Three coordinated choices:

**1. Ship a separate `@mnemehq/embedder-local` package, not a bundled feature.**

`@mnemehq/sdk` exports the `Embedder` interface and accepts an `embedder` option in `new Mneme()`. `@mnemehq/embedder-local` lives at `packages/embedder-local`, depends on `@huggingface/transformers`, and implements `Embedder` with a `LocalEmbedder` class. `@mnemehq/sdk` does NOT depend on `@mnemehq/embedder-local` — users opt in by installing both.

**2. Default model is `Xenova/all-MiniLM-L6-v2` at 384 dimensions.**

It's MIT-licensed, ~25 MB on disk, fast on CPU, well-known in the sentence-transformers community, and produces L2-normalised outputs so cosine reduces to a dot product in our SDK. Multilingual and larger models (e.g. `Xenova/multilingual-e5-small`, `Xenova/bge-base-en-v1.5`) are supported via the `model` and `dimensions` options.

**3. Single embedder per store, no mixed embeddings, no migration in v0.0.2.**

When an embedder is configured, every plaintext `remember()` stores an embedding alongside the record. `recall()` runs cosine similarity over records that have embeddings; records without embeddings are silently excluded from semantic search (they remain readable by ID and via `exportAll`). Switching embedders later or changing the default model produces stale embeddings that the SDK cannot detect. **A re-embedding migration ships in a later version** (and likely adds an `embeddingModel` field to the protocol's `MemoryRecord`).

**4. Integration tests gated behind `MNEME_RUN_INTEGRATION=1`.**

Shape tests for `LocalEmbedder` (constructor, dimensions) run by default. The real-model integration test (model download, embed, cosine sanity check) is skipped in CI because Bun 1.3.x crashes on process exit when `onnxruntime-node` unloads — the tests pass, the exit code does not. The integration test is opt-in via env flag until upstream resolves the crash. We open a tracking issue and flip the default back to opt-out when it's fixed.

## Consequences

Positive:

- Users who don't need semantic search pay zero install cost — `@mnemehq/sdk` stays tiny.
- Local-first promise holds end-to-end — no API keys, no third-party requests for embeddings.
- The `Embedder` interface is implementation-agnostic; future packages (`@mnemehq/embedder-voyage`, `@mnemehq/embedder-openai`, custom) drop in without SDK changes.
- The default model choice is conservative — small, fast, MIT, well-understood — minimising surprise for first-time users.

Negative:

- Switching models silently invalidates existing embeddings. Users who change `model` mid-stream get bad search quality until they re-`remember()` everything. Documented loudly in the package README; re-embedding migration is the v0.1 fix.
- Real-model tests don't run in CI today. We accept the gap because (a) the wrapper is ~50 lines and shape-tested, (b) the integration test can be run locally before any release, and (c) the cause (Bun + ONNX cleanup) is upstream, not ours to fix.
- Hybrid (BM25 + cosine) ranking is not implemented in v0.0.2 — when an embedder is configured we use cosine *only*. This may miss exact-keyword hits where lexical BM25 would have ranked them higher. Hybrid scoring (RRF) is tracked as a follow-up.

## Alternatives considered

- **Bundle `@huggingface/transformers` directly in `@mnemehq/sdk`.** Rejected — install bloat for users who don't want embeddings, plus locks every SDK consumer to the ONNX runtime even on environments where it's not viable (edge functions, browser without WASM fallback).
- **Default to a hosted embedder (Voyage / OpenAI).** Rejected — sends memory contents to a third party on every write. Direct contradiction of the local-first promise. Hosted embedders ship as separate packages (`@mnemehq/embedder-voyage`) for users who explicitly opt in.
- **Record the embedding model on each `MemoryRecord` and silently route queries to a per-model index.** Considered for the future migration story. Out of scope for v0.0.2 — adds protocol surface area (`MemoryRecord.embeddingModel`), version-handshake complications, and multi-index storage. Defer until we actually need to migrate.
- **Pin `@huggingface/transformers` to a specific version.** Considered. Using `^3.0.0` for now to track minor improvements; we'll pin if upstream breaks consumers.
- **Use the WASM ONNX backend instead of `onnxruntime-node` to dodge the Bun crash.** Investigated but adds setup friction (WASM SIMD flags, slower CPU inference). Easier to gate the integration test for one release cycle and let Bun fix the native-addon cleanup.
