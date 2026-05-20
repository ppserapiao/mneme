# mneme eval baselines

This directory holds committed eval baselines for each `(promptVersion, model)` combination. Each file represents the **best known** state for that combination at the time of commit; PRs that change the prompt or change models MUST also update the relevant baseline.

## File naming

```
<promptVersion>__<model>.md
```

For example: `2026-05-20a__claude-sonnet-4-6.md`.

## How baselines are produced

```sh
# From the repo root, with ANTHROPIC_API_KEY exported in YOUR terminal
bun run eval:live --write-baseline
```

The runner writes both the markdown baseline (here) and a timestamped JSON report (in `tests/eval/reports/`, which is gitignored).

## What a baseline contains

Each file is the markdown output from `renderMarkdown()` (see `src/reporter.ts`):

- Headline: P / R / F1 / TP / FP / FN over the full corpus
- Per-category breakdown (6 categories: personal-chat, journal, slack, meeting-notes, edge-cases, domain-specific)
- Per-sample errors block (when present)
- Header metadata: prompt version, model, started-at timestamp, total duration, total cost

## How baselines get used

Once CI integration lands (ADR 0013 §7), PRs that modify `packages/distiller-claude/src/prompts.ts` will:

1. Re-run the eval with the new prompt against the same corpus
2. Diff the resulting metrics against the baseline at HEAD
3. Fail merge if F1 drops by more than the agreed threshold (likely 5%)
4. The PR author updates the baseline file with the new numbers if the regression is intentional

Until CI lands, baselines are advisory — the reviewer compares manually.

## What an empty directory means

If this directory is empty (other than this README), the eval has been built but never run live. That's the bootstrap state — Pedro runs `bun run eval:live --write-baseline` from his terminal post-merge to produce the first real baseline. Cost: ~£0.30-£0.60 cache-warm against Sonnet.
