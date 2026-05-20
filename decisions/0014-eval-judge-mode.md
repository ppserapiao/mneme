# 0014 — Dual-matcher eval (keyword + LLM-as-judge)

**Status**: Accepted
**Date**: 2026-05-20

## Context

ADR 0013 shipped the eval harness with a single keyword-substring matcher. Four prompt revisions later, we've moved F1 from 56.7% to 68.2% — and stalled. The per-revision telemetry (`tests/eval/baselines/2026-05-20a..d__claude-sonnet-4-6.md`) shows the matcher itself is now the bottleneck:

- Per-revision F1 swings are now ±1pp at the overall level while individual categories swing ±5-25pp — classic prompt-engineering whack-a-mole signature.
- Manual inspection of the 19 false positives in v4 shows several are extractions that are **semantically equivalent** to expected entries but use different vocabulary. The keyword matcher counts them as FP+FN double-loss.
- The strict matcher penalises legitimate phrasing variation. "Lives in London" vs "Resides in London" vs "Based in London" → strict says no match, a human reviewer says obvious match.

We have two distinct measurement needs:

1. **Regression gating in CI** — deterministic, free, fast, reproducible. The keyword matcher is perfect for this.
2. **Public quality reporting + failure analysis** — semantic, realistic, the kind of number we put on the website. The keyword matcher under-counts here.

These are **complementary, not competitive.** This ADR locks the dual-matcher design that reports both side-by-side in every eval run.

## Decision

### 1. Two matchers, both always available

| Matcher | When | Cost | Determinism | Use |
| --- | --- | --- | --- | --- |
| **keyword** (ADR 0013) | Default; always runs | $0 | 100% reproducible | CI regression gate |
| **judge** (this ADR) | Opt-in via `--judge=claude` | ~$0.10-0.20 per eval run | Stochastic (sampling) but high agreement at low temperature | Public quality + failure analysis |

A single eval run with `--judge=claude` does **one distillation per sample** (the expensive step) and **two scorings** of the same outputs — once with the strict keyword matcher, once with the LLM judge. Both sets of metrics land in the same `EvalReport`. Both render side-by-side in the console table and the committed markdown baseline.

### 2. `Matcher` interface — pluggable strategy

```ts
export interface Matcher {
  readonly name: string                                          // 'keyword' | 'judge-claude' | …
  match(extracted: ExtractedMemory, expected: ExpectedMemory): Promise<MatchResult>
}
export type MatchResult = { matched: boolean; reason?: string; confidence?: number }
```

The existing `isMatch()` keeps living as a synchronous predicate (used directly by unit tests and as the body of `KeywordMatcher`). `assign()` becomes async and takes a `Matcher`.

This lets us add `JudgeOpenAIMatcher`, `JudgeLocalMatcher`, embedding-similarity matchers, or anything else as drop-in replacements without touching the runner.

### 3. Judge model defaults to Haiku, not Sonnet

The judge task ("are these two memories saying the same thing about the same person?") is *much* simpler than extraction. Haiku-4-5 handles it reliably and costs ~5x less than Sonnet:

- Sonnet 4.6 prices: $3/M input, $15/M output. A typical judge call (~150 input + ~80 output) costs ~$0.0017.
- Haiku 4.5 prices: $1/M input, $5/M output. Same call costs ~$0.00055.
- A judge-mode eval run has ~150-250 judge calls (one per extracted×expected pair across the corpus).

Sonnet judge: ~$0.30 per run. Haiku judge: ~$0.10 per run. Default to Haiku; override via `--judge-model=<m>`. Both ship with prompt caching enabled on the system prompt.

### 4. The judge prompt

Tool-use structured output (same pattern as the distiller, ADR 0012 §3) for parser robustness. Zod-validated tool input:

```ts
const JudgeOutputSchema = z.object({
  matched: z.boolean(),
  reason: z.string().min(1).max(280),
  confidence: z.number().min(0).max(1),
})
```

System prompt explicitly:
- "Two memories MATCH if they capture the same underlying signal about the same person, even with different vocabulary."
- "DO NOT match if they're about different facts even when phrased similarly."
- "DO NOT match if the `kind` differs in a way that meaningfully changes how the memory would be used (e.g. a `fact` about location vs a `preference` about location are different kinds of memories)."
- Three few-shot examples covering: clear match different phrasing, clear no-match same vocabulary, edge case requiring judgement.

Temperature: 0 (or as low as the API allows for determinism). Confidence floor for accepting a match: 0.7 (configurable). Below 0.7, treat as no match.

### 5. Output shape

```ts
type SampleResult = {
  sampleId, category, extracted, durationMs, costUsdEstimate
  strict: ScoreBlock                  // always present
  semantic?: ScoreBlock              // present only when --judge was passed
  judgeCostUsdEstimate?: number
}
type ScoreBlock = {
  tp, fp, fn
  matchedExpected: number[]
  matchedExtracted: number[]
}
type EvalReport = {
  ...
  strict: AggregateMetrics            // headline strict numbers
  semantic?: AggregateMetrics        // headline semantic numbers
  judge?: { model: string; totalCostUsdEstimate: number }
}
```

Console table renders both strict and semantic columns. Markdown baseline shows two headline rows (Strict F1, Semantic F1) plus side-by-side per-category. JSON report is the full structured output for diff tooling.

### 6. Greedy assignment — same algorithm, async

`assign()` becomes async because the matcher is now async. The greedy many-to-many pairing logic is unchanged. Side effect: with a real LLM matcher, each assignment call makes O(extracted × expected) judge requests per sample. For a typical sample with 2-3 expected and 2-3 extracted, that's 4-9 calls. Across the corpus: 150-250 calls per run.

Pair-checks are NOT cached across samples — each pair is unique and the judge sees both bodies. But the system prompt + few-shots IS cached on Anthropic's side via the standard prompt-caching API (same mechanism the distiller uses), giving ~80-90% input-cost discount after the first call.

### 7. Cost ceiling, retries, observability

`JudgeMatcher` inherits the same production discipline as `ClaudeDistiller`:

- Hard cap via `maxCostUsdPerRun` (default $1 — the judge should never spend more than the distillation itself)
- Retry on 429/5xx with exponential backoff (250ms → 2s)
- Per-call timeout (default 15s, less than distillation since judge tasks are smaller)
- `onEvent` observability hook
- Pure `Error` rethrow on non-retryable failures

### 8. Reporting both numbers honestly

The eval report's headline becomes:

```
Strict F1:   68.2%   (P 69.8% / R 66.7%)
Semantic F1: 7X.X%   (P 7X.X% / R 7X.X%)
```

Not "the F1." Not "we picked the higher one." **Both**, always, with the methodology behind each clear.

For the website / pitch deck:

> "mneme distillation scores **Semantic F1 = 7X.X%** on the canonical 30-sample corpus against claude-sonnet-4-6 (prompt v2026-05-20d, judged by claude-haiku-4-5). The same prompt scores **Strict F1 = 68.2%** under deterministic keyword matching, which we use for CI regression gating. Both numbers are reproducible: `bun run eval:live --judge=claude` against the committed corpus."

That's the elite-grade methodology statement.

## Consequences

### Positive

- **Two numbers, both honest.** Strict for "the CI gate isn't lying about regressions"; semantic for "what's actually true about extraction quality."
- **Prompt iteration becomes signal-rich again.** Cross-category swings that the keyword matcher made look like whack-a-mole may be small under the semantic matcher — meaningful prompt revisions can be detected.
- **Failure analysis gets sharper.** When the two matchers disagree (e.g., keyword says FP but judge says match), that's a corpus refinement signal: the corpus author's `mustInclude` keywords are too narrow for legitimate phrasing variation.
- **Same harness, no architectural lock-in.** Future matchers (embedding-similarity, OpenAI-judge, local-llama-judge) drop in behind the same `Matcher` interface.

### Negative

- **The semantic F1 number depends on the judge model.** Different judges will produce slightly different numbers. We pin the judge model (default `claude-haiku-4-5`) and document it in the report header to keep this comparable across runs.
- **Judge stochasticity.** Even at temperature 0, real LLM calls show small day-to-day variation. The semantic F1 number is reproducible to ~±1pp, not to the digit. Acceptable; documented.
- **One more thing to budget.** `--judge` mode adds ~$0.10 per run on Haiku. Trivial against the value, but it's worth flagging.
- **Circular concern: Claude judging Claude.** A Claude-family judge scoring Claude-distilled output has an inherent confidence bias. Mitigated by: (a) the judge uses Haiku, not the same model as the distiller (Sonnet); (b) the prompt explicitly emphasises strictness; (c) the judge prompt is committed and audit-able; (d) v3+ of the eval (deferred) can add a non-Claude judge for triangulation.

## Alternatives considered

- **Embedding-similarity matcher** (cosine ≥ threshold between extracted and expected, using `@mnemehq/embedder-local`). Considered. Rejected for v0.1 of the judge — adds a dependency on the embedder choice and the threshold tuning is itself a non-trivial calibration exercise. Revisit when we have local embedding embedded in the harness anyway.
- **Replace the keyword matcher entirely with the judge.** Rejected — the keyword matcher's determinism is genuinely valuable for CI gating. We don't want CI failing because the judge had a 1-in-50 disagreement.
- **Run the judge on the FULL keyword-matched pair set** (only judge what keyword says is a match, to confirm). Rejected — defeats the purpose. The whole point is to catch the FPs and FNs the keyword matcher missed.
- **OpenAI as the judge** (different vendor than the distiller). Considered as a way to reduce the "Claude judging Claude" concern. Deferred — adds a second provider dependency. Revisit if the bias concern proves real in practice.
- **Hand-judge the FPs ourselves** instead of automating. Reasonable for the first few runs but doesn't scale. The automation is the point.

## Forward path

- **v0.2 of the eval harness** (next PR after this one): audit FPs that strict says are wrong but judge says are right. Refine the corpus where appropriate. Expected: tightens the keyword matcher's coverage without compromising rigour.
- **v0.3**: corpus expansion — 30 → 90-120 samples for acquirer-grade defensibility.
- **v0.4**: CI integration. The strict matcher gates PRs that touch `prompts.ts`. The judge runs on a weekly cron + reports trend over time.
- **v1.0**: publish the eval harness + corpus as a standalone repo. *"Run mneme through our eval. Run YOUR memory system through our eval. Compare."*
