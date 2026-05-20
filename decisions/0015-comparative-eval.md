# 0015 — Comparative eval: scoring competitor systems against our corpus

**Status**: Accepted
**Date**: 2026-05-20

## Context

ADR 0013 established the corpus + matcher. ADR 0014 added the LLM-as-judge for semantic scoring. With those in place, mneme's distiller scores `Strict F1 = 62.4% / Semantic F1 = 78.1%` on our 100-sample / 222-expected-memory corpus.

That's our number. The next-highest-leverage artefact — for the website, the pitch deck, and any acquirer due-diligence conversation — is the **comparison table**:

> On the same public 100-sample memory-extraction corpus, scored by the same dual-matcher methodology:
>
> | System | Strict F1 | Semantic F1 |
> | --- | ---: | ---: |
> | mneme | 62.4% | 78.1% |
> | Mem0 | ? | ? |
> | Letta | ? | ? |
> | Zep | ? | ? |

That table is the artefact that converts mneme from *"interesting open memory idea"* into *"measurably competitive memory infrastructure."* This ADR locks the methodology for running competitor systems through our eval fairly, so the table is defensible to a technical reviewer rather than looking like marketing theatre.

## Decision

### 1. Competitors are wrapped behind our `Distiller` interface

Every system under test implements the same `Distiller` interface (`@mnemehq/sdk`):

```ts
interface Distiller {
  readonly name: string
  readonly model: string
  distill(input: DistillInput): Promise<DistillOutput>
}
```

The existing `runEval` engine runs unchanged. Only the distiller swaps. The same corpus, the same scoring (strict + judge), the same per-sample isolation. **One adapter per competitor, in `tests/eval/src/competitors/<name>.ts`.**

This PR ships the first adapter: `Mem0Distiller`. Letta, Zep, OpenAI Memory, ChatGPT Memory (via API where available), and any other system land in follow-up PRs using the same template.

### 2. Each competitor is configured at its DEFAULT recommended settings

The temptation with comparative evals is to tune the competitor to make them look weak (adversarial) or to fix their weaknesses for them (charitable). Both bias the comparison. The discipline we commit to:

> **Configure each competitor at the settings their own docs/quickstart recommends to a first-time user. Document every config choice in the adapter file. Don't change anything else.**

For Mem0 specifically:
- **LLM**: `claude-sonnet-4-6` via `AnthropicLLM`. Same model mneme's distiller uses. Mem0's own quickstart suggests "use any supported provider"; picking the same model as mneme is the most-fair single choice.
- **Embedder**: OpenAI `text-embedding-3-small`. Mem0's default. Anthropic doesn't ship an embeddings API so Anthropic-only is impossible.
- **Vector store**: in-memory (`MemoryVectorStore`). Mem0's zero-setup default. No external Qdrant / pgvector required to reproduce.
- **History**: disabled. Per-sample isolation makes history irrelevant.
- **infer**: `true` (the default). Without this Mem0 doesn't do extraction at all; it just stores raw messages. Comparison requires extraction.

### 3. Per-sample isolation via fresh `user_id`

Mem0 maintains a single memory graph per `user_id`. Across-sample memory leakage would let earlier samples influence later ones — destroying the comparison's per-sample independence.

The adapter generates a fresh UUID per sample, used as `user_id` for both `memory.add()` and `memory.getAll()`. After scoring, the sample's memories are discarded.

### 4. Kind mapping — methodology choice, documented

Our corpus expects six `MemoryKind` values (`fact`, `preference`, `event`, `relationship`, `context`, `skill`). The strict matcher requires `extracted.kind === expected.kind` to count a match.

Mem0 doesn't classify memories by kind. Every Mem0 `MemoryItem` is just `{ id, memory: string, ... }`. To map this fairly we have two real options:

- **Default-fact**: assign every Mem0 memory to `kind: 'fact'`. Simple, deterministic, documented. **Will under-count in strict scoring** for samples where the corpus expects `preference` / `event` / etc., because the strict matcher requires kind equality. **The semantic judge corrects this** because the judge's decision rules explicitly allow kind-tolerance when the body content matches ("two memories MATCH if they capture the same underlying signal about the same person, even with different vocabulary").
- **LLM-classify**: small Claude call per Mem0 memory to pick the best of six kinds. More accurate but adds cost (~$0.001 per memory) and introduces our own model into the competitor's pipeline.

**v0.1 picks default-fact.** Reasoning: the strict score with default-fact gives a CONSERVATIVE lower bound for Mem0 (we never falsely inflate it); the semantic score gives the realistic upper bound. Reporting both honestly captures the methodology constraint. If the gap between the two is suspicious (e.g. semantic >> strict by 30pp+), it's a signal for v0.2 (LLM-classify) — exactly the same iteration pattern we used for our own distiller.

### 5. Cost accounting

Mem0 makes internal LLM calls via the supplied Anthropic client and embedding calls via the OpenAI client. We don't reliably observe these per-call. The adapter reports:

- `costUsdEstimate: 0` in `DistillOutput.usage` (we don't know the cost from inside Mem0)
- A console note at run start: *"Mem0 will make Anthropic and OpenAI calls under the supplied keys. Expect ~$0.30 Anthropic + ~$0.05 OpenAI for a 100-sample run; monitor your dashboards."*
- The report header records the LLM model + embedder model so future reviewers know what was provisioned.

Improving cost observability is a v0.2 concern (instrument the supplied clients with response interceptors). For v0.1 we accept the limitation, documented openly.

### 6. Baseline file naming includes distiller

Currently baselines are named `<promptVersion>__<model>.md`. mneme's baselines all stamp `promptVersion = 2026-05-20d` and `model = claude-sonnet-4-6`. A Mem0 run would clobber the same file — unacceptable.

New convention: `<promptVersion>__<model>__<distillerName>.md`. mneme stays at `2026-05-20d__claude-sonnet-4-6__claude-distiller.md` (existing files renamed in this PR); Mem0 produces `mem0-v3__claude-sonnet-4-6+text-embedding-3-small__mem0-distiller.md`. Each system has its own slot.

For Mem0 specifically `promptVersion` is recorded as the Mem0 package version (currently `3.0.3`) so we know which Mem0 release the numbers correspond to.

### 7. What this comparison DOES and DOES NOT claim

What the comparison claims:

- "On a fixed 100-sample memory-extraction corpus, scored by the same dual-matcher methodology (strict keyword + LLM-as-judge), mneme scores X and Mem0 scores Y."
- The corpus, the matchers, and the configs are all public + reproducible. Anyone can run `bun run eval:live --judge=claude --distiller=mem0` and verify.

What the comparison does NOT claim:

- That Mem0 is "worse" or "better" than mneme as a product. Memory systems do many things; this corpus tests one (extraction quality from raw text).
- That this is an apples-to-apples model comparison. Mem0 has its own internal prompts, extraction strategies, and architecture. We're comparing **systems at their defaults**, not models.
- That a different corpus would produce the same ranking. Our corpus reflects our team's product judgment about what memory extraction means in practice (six categories, 222 expected memories, English personal-context tone). A corpus focused on, e.g., long-form research papers would test different competencies.
- Methodology limitations are listed in each baseline file so reviewers see them upfront, not hidden.

### 8. Required environment for Mem0 runs

```sh
export ANTHROPIC_API_KEY='sk-ant-...'   # for Mem0's LLM AND our judge
export OPENAI_API_KEY='sk-...'           # for Mem0's embedder
bun run eval:live --judge=claude --distiller=mem0 --write-baseline
```

Both keys must be set in the user's terminal (never in chat — see `feedback_never_paste_secrets_in_chat`). The Mem0 adapter fails fast with a clear error if either is missing.

## Consequences

### Positive

- **The comparison table becomes producible.** Same corpus, same scoring, defensible methodology. The artefact that turns "we have a memory layer" into "we have a measurably competitive memory layer."
- **Pluggable for future competitors.** Each new system is one ~300-line adapter file. Letta, Zep, OpenAI Memory, etc. ship in follow-up PRs without architectural change.
- **Reproducible.** Anyone with the two API keys can clone, install, run, and verify the numbers within ±2-3pp (model stochasticity).
- **Honest about limitations.** Methodology constraints (kind-mapping, cost observability, "default-config only") are documented per ADR and per baseline file. Defensible to a technical reviewer.

### Negative

- **OpenAI key is now a soft dependency.** mneme itself doesn't need OpenAI, but running comparative eval against Mem0 (and likely future competitors) does. We document this clearly; we don't take it on as a hard mneme dependency.
- **Default-fact kind mapping under-counts Mem0 in strict scoring.** We mitigate by always reporting semantic alongside strict. If Mem0's strict number looks surprisingly low, that's a documented methodology artefact, not a Mem0 quality claim.
- **Cost is not auto-tracked inside Mem0.** Users monitor their own Anthropic + OpenAI dashboards. Acceptable for v0.1; instrumented in v0.2.
- **Comparative eval consumes more total Anthropic budget per run.** mneme distill: ~$0.45. Mem0 distill: ~$0.30 of Anthropic + $0.05 OpenAI. Judge: ~$1.80 for either. Running both side-by-side costs ~$3.10/run. Still under any reasonable cap.

## Alternatives considered

- **Build a comparative harness from scratch, not behind the Distiller interface.** Considered. Rejected because the existing runner + matcher + judge code is exactly what we want — the only thing that varies between systems is "given input text, return extracted memories." That's the Distiller interface. Reusing it costs nothing.
- **Use Mem0's hosted service (`mem0ai` SaaS) instead of the open-source SDK.** Considered. Rejected because (a) it requires a Mem0 account + ongoing $ commitment, (b) it's a moving target (Mem0 controls the model + prompts server-side and they change), (c) less reproducible by third parties. The OSS SDK is the version any developer would self-host.
- **LLM-classify Mem0 memories into one of our six kinds.** Considered. Deferred to v0.2 — adds cost + complexity, and the semantic judge already handles kind-tolerance reasonably well. Revisit if the strict-semantic gap on competitor evals proves consistently noisy.
- **Run all three competitors (Mem0 + Letta + Zep) in this PR.** Considered. Rejected for scope: Letta is Python-first (would need a Python subprocess driver), Zep is a hosted service (needs account setup). One adapter per PR keeps each one focused, reviewable, and isolating any methodology mistakes to the affected competitor.
- **Use a different judge model when scoring competitors** (so it's not "Claude judging Claude × Mem0"). Considered. Rejected for v0.1 — the judge's job is to assess semantic equivalence of bodies it sees in isolation; nothing in the prompt tells it which system produced which. The bias concern is real but small; if it becomes load-bearing in our pitch, v0.2 adds a non-Claude judge (Gemini or GPT-4o) for triangulation.

## Forward path

- **v0.2**: Letta adapter (likely via Python subprocess driver).
- **v0.3**: Zep adapter (hosted service; needs account setup documented).
- **v0.4**: Cost auto-tracking via instrumented Anthropic + OpenAI clients (response interceptors).
- **v0.5**: Optional LLM-classify mode for kind-mapping (`--competitor-kind-mode=llm`).
- **v1.0**: Publish the comparison repo + corpus + harness as a standalone benchmark, run it on a cadence, post the leaderboard somewhere a third party can audit.
