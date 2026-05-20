# 0013 — Eval harness for distiller extraction quality

**Status**: Accepted
**Date**: 2026-05-20

## Context

ADR 0012 shipped `@mnemehq/distiller-claude` and the SDK-level `Distiller` interface — proof that the wire works. We have unit tests, the smoke test exercises real Anthropic against the published packages, and we know the prompt + tool-use schema produces structured output. What we **do not** have is a number that lets us answer the question every serious user, design partner, and acquirer will ask first:

> "Is it actually any good?"

Without a measurable answer, every claim about extraction quality is unfalsifiable. The acquirer-grade pitch ("we extract memories better than Mem0 / Letta / Zep") requires evidence. The contributor-facing claim ("don't merge this prompt change, it regresses precision by 12%") requires a regression gate. Both require an eval harness.

This ADR locks the design of the first eval — scoped tightly to **extraction quality** (does the distiller produce the right memories from raw text), with retrieval-quality measurement (does recall surface the right memory for a given query) deferred to a follow-up.

## Decision

### 1. What we measure — extraction precision, recall, F1

For each curated corpus sample we record:

- **TP (true positive)** — an extracted memory matches an expected memory (same `kind`, body contains every `must_include` keyword, body contains none of the `must_not_include` anti-patterns)
- **FP (false positive)** — an extracted memory has no expected match (over-extraction, off-topic, or hallucination)
- **FN (false negative)** — an expected memory has no extracted match (under-extraction)

Aggregated:

- **Precision** = TP / (TP + FP) — of what we extract, how much is right
- **Recall** = TP / (TP + FN) — of what we should have extracted, how much we found
- **F1** = harmonic mean — single headline number

We **explicitly do not** measure retrieval quality (does `recall("coffee")` return the coffee memory first) in this ADR. Retrieval quality is a separate axis that needs an embedder and a different corpus shape (queries with ranked expected results). It lands in ADR 0014.

### 2. Corpus — 30 hand-curated samples across 6 categories

Stored as one JSONL file per category in `tests/eval/corpus/`:

- `personal-chat.jsonl` — user volunteering signals in an AI assistant chat
- `journal.jsonl` — single-author reflective writing
- `slack.jsonl` — short messaging-style input
- `meeting-notes.jsonl` — professional context, mixed voices
- `edge-cases.jsonl` — empties, pure-questions, third-party gossip, hypotheticals, repetition (the "should NOT extract" tests)
- `domain-specific.jsonl` — developer, designer, health, travel, family contexts

5 samples per category, 30 total. Sized so a full run against Sonnet completes in under 90 seconds (well within the prompt-cache 5-minute TTL) and costs under £1 cache-warm.

Sample shape:

```json
{
  "id": "personal-chat-001",
  "category": "personal-chat",
  "input": "Quick note — I'm allergic to peanuts, just in case it comes up...",
  "expected": [
    {
      "kind": "fact",
      "gist": "Allergic to peanuts",
      "mustInclude": ["allerg", "peanut"],
      "mustNotInclude": []
    }
  ],
  "notes": "Tests explicit health-fact extraction"
}
```

The corpus is **versioned in git**, lives alongside the code, and is curated by the team (initial 30 by the technical co-founder; Pedro reviews and refines as he uses the system more). Future contributions to the corpus go through PR review like any other code change.

### 3. Matching — case-insensitive substring with greedy many-to-many assignment

Two alternatives considered and explicitly rejected for v0.1:

| Strategy | Why rejected for v0.1 |
| --- | --- |
| **Exact match** | Too strict — punishes legitimate phrasing variation ("Lives in London" vs "Based in London") |
| **LLM-as-judge** (Claude scores each extracted-vs-expected pair) | Deferred to v0.2 — adds API cost, non-determinism, and a circular concern when judging the same model's output. Real value once we have a stable baseline to compare against. |

Picked: **case-insensitive substring matching on `mustInclude` keywords**, with anti-patterns from `mustNotInclude` enforced. Plus `kind` match required (a `fact` extraction cannot match a `preference` expectation).

To handle the case where one extracted memory legitimately satisfies multiple expected entries (a concise extraction covers two aspects), the matcher uses **greedy many-to-many assignment** maximising TP count. An extracted memory can match at most one expected entry per pass; an expected entry can be matched by at most one extracted memory per pass; multiple passes until no more matches found.

This matcher is conservative — it under-counts when extraction phrasing diverges from the corpus author's keywords. That's a deliberate v0.1 trade: low false-confidence is more important than maximising the headline number while we're still calibrating the corpus.

### 4. Cost ceiling + concurrency

Every eval run takes a `maxCostUsd` budget (default **$5** per run = ~£4). The runner tracks running cost via the adapter's `usage.costUsdEstimate` and aborts the next sample if continuing would exceed the cap.

Concurrency: up to **4 parallel calls** to Anthropic. Conservative for safety; Anthropic's tier rates are higher. Sequential mode (`concurrency=1`) is the default in CI to avoid rate-limit flakiness; local dev defaults to 4.

Anthropic prompt caching is enabled by default in the distiller, so the system prompt + few-shot examples get cached after the first call — typical 30-sample run pays full input cost once and ~10% on the other 29. Real cost per run, cache-warm, against Sonnet: ~£0.30-£0.60.

### 5. Reporting — three formats, three audiences

- **Console table** for humans running the eval locally. Per-sample row + per-category aggregate + overall headline.
- **JSON report** (`tests/eval/reports/<timestamp>-<promptVersion>-<model>.json`) — full structured output for CI regression-diff and future tooling.
- **Markdown baseline** (`tests/eval/baselines/<promptVersion>-<model>.md`) — committed to git, snapshots the "best known" state. Each PR that changes prompts MUST also update this baseline with the new numbers; reviewer compares old vs new.

Every report header records the things needed to interpret it later: prompt version, model, timestamp, total cost, total duration, total samples, total expected memories, total extracted, overall P/R/F1.

### 6. Prompt-version pinning

The `PROMPT_VERSION` constant in `packages/distiller-claude/src/prompts.ts` (shipped in ADR 0012) is the contract. The eval runner reads it from the distiller and stamps it into every report. PRs that bump the prompt MUST also produce a fresh baseline; reviewer's job is to confirm the new baseline doesn't regress F1 significantly.

When the runner observes a `PROMPT_VERSION` it has no baseline for, it warns ("no baseline for prompt-2026-05-25b — first run") but does not fail.

### 7. CI integration

**Out of scope for this PR.** The eval costs money per run, so we don't want it firing on every PR push. CI integration ships separately, gated on:

- PRs that touch `packages/distiller-claude/src/prompts.ts` — auto-run, fail merge if F1 drops >5% vs baseline
- Manual `workflow_dispatch` for ad-hoc runs
- Weekly cron for drift detection (models update server-side, our prompt may need adjustment)

For this PR the runner is local-only. `bun run eval` (mock) and `bun run eval:live` (real Anthropic, requires `ANTHROPIC_API_KEY` in env) are the entry points.

## Consequences

### Positive

- **One number to compare prompt revisions** — F1 against the canonical corpus. Replaces vibes with measurement.
- **Acquirer-grade artefact** — "we score F1 = X on a public, versioned corpus of 30 representative inputs" is a defensible competitive claim. The corpus itself is public; competitors can run mneme through it.
- **Regression gate** — once CI integration lands (next PR), prompt drift can't sneak through. Same discipline as the publish-pipeline safety net (ADR 0011 §postmortem).
- **The corpus IS the product spec** — categories + sample distribution captures the team's product judgment about what extraction quality means in practice. Future ICP shifts (e.g., a heavy-Slack design partner) trigger corpus expansion.
- **Open path to LLM-as-judge v0.2** — once the keyword-matched baseline is stable, layering Claude-judged semantic matching on top adds a second confidence metric.

### Negative

- **Keyword matching under-counts.** Extractions that say the same thing in different words get marked FN even if they're correct. Mitigated by careful `mustInclude` design (broad stems like "allerg" not "allergic") and by the LLM-judge follow-up.
- **The corpus is a small sample of reality.** 30 inputs cannot represent every legitimate distillation scenario. Mitigated by category coverage + ongoing expansion as we learn from real users.
- **Running costs real money.** ~£0.50/run cache-warm against Sonnet. Capped per-run, but iterating on prompts during an active week could rack up ~£5-£10. Tracked, budgeted, acknowledged.
- **Model drift is invisible without re-running.** Anthropic improves Sonnet server-side; what was the "right" output yesterday may differ today. The weekly cron in CI is the mitigation.

## Alternatives considered

- **Use an external public eval (LongBench, MemoryBench, etc.) instead of curating our own.** Considered. Rejected because (a) those evals don't measure what mneme cares about — they're general LLM benchmarks, not memory-extraction-from-conversational-input — and (b) "we beat the public benchmark" is weaker than "we ship our own opinionated corpus that reflects our ICP." Revisit when a memory-specific benchmark gains traction.
- **LLM-as-judge from day one.** Considered. Rejected for v0.1 — adds non-determinism (judge output varies) and circularity (Claude judging Claude). Reasonable for v0.2 once we have a calibrated keyword baseline to compare against.
- **Eval as part of `bun test` (runs on every PR).** Rejected — costs money, takes 30-90s. Belongs in its own gated workflow.
- **Embedding-similarity matching** (cosine ≥ threshold between extracted and expected). Considered. Rejected because we don't ship a default embedder and adding one as an eval dependency couples the eval to embedding choice. Keyword matching is provider-agnostic.
- **Per-extracted-memory scoring instead of corpus-level F1.** I.e., give each extracted memory a 0-1 quality score and average. Rejected — F1 against ground truth is the standard IR metric and lets us compare apples-to-apples with future approaches.
- **Larger corpus from the start (100+ samples).** Considered. Rejected for v0.1 because curating 100 high-quality samples is meaningfully different work than curating 30 — and getting the matcher + reporter shape right with 30 samples then growing the corpus is a faster iteration loop than waiting weeks to ship.

## Forward path

- **v0.2 (next PR)**: LLM-as-judge mode (`--judge=claude`) for semantic matching, plus CI integration on prompt changes.
- **v0.3**: Retrieval-quality eval — distill the input, then run a battery of queries and measure precision@k / MRR.
- **v1.0**: Public benchmark — host the corpus + harness as a standalone repo competitors can run against their own systems. The competitive moat becomes "mneme scores X, public framework can be verified by anyone."
