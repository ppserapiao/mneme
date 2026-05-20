# @mnemehq/eval

Distiller extraction-quality eval harness (ADR 0013). **Private package** — not published to npm. Runs against the workspace.

## Run it

From the repo root:

```sh
bun run eval              # mock mode — free, deterministic, ~50ms
bun run eval:live         # real Anthropic — needs ANTHROPIC_API_KEY in env
bun run eval:baseline     # real Anthropic + writes the markdown baseline
```

For `--live`, set the key in your terminal first (never paste into chat):

```sh
export ANTHROPIC_API_KEY='sk-ant-...'
bun run eval:live
```

Cost ceiling defaults to **$5** per run. Sonnet-with-prompt-caching pays roughly £0.30-£0.60 for the full 30-sample corpus.

## Layout

```
tests/eval/
├── corpus/                    ← 6 categories × 5 samples each = 30 JSONL lines
│   ├── personal-chat.jsonl
│   ├── journal.jsonl
│   ├── slack.jsonl
│   ├── meeting-notes.jsonl
│   ├── edge-cases.jsonl
│   └── domain-specific.jsonl
├── baselines/                 ← committed reference reports (one per prompt × model)
│   └── README.md              ← contract for baseline updates
├── reports/                   ← per-run JSON outputs (gitignored)
└── src/
    ├── types.ts               ← CorpusSample, ExpectedMemory, EvalReport, ...
    ├── corpus.ts              ← JSONL loader + per-line validator
    ├── matcher.ts             ← isMatch, greedy many-to-many assign, P/R/F1
    ├── runner.ts              ← runEval — concurrency, cost budget, failure isolation
    ├── reporter.ts            ← renderConsole, renderMarkdown, renderJson, diff
    ├── cli.ts                 ← bun run eval entry point
    └── *.test.ts              ← unit tests (mock distiller, no Anthropic calls)
```

## Adding a corpus sample

Append one JSON line to the appropriate category file. Each sample is:

```json
{
  "id": "<category>-NNN",
  "category": "<one of the six>",
  "input": "<raw text fed to mneme.distill()>",
  "expected": [
    {
      "kind": "<MemoryKind from @mnemehq/protocol>",
      "gist": "<human-readable summary>",
      "mustInclude": ["<keyword>", "..."],
      "mustNotInclude": ["<anti-pattern>"]
    }
  ],
  "notes": "what this sample tests (optional but encouraged)"
}
```

Pick **broad keyword stems** for `mustInclude` so legitimate phrasing variation still scores TP. Prefer `"allerg"` over `"allergic"`, `"London"` over `"Lives in London"`. The matcher is case-insensitive substring; you don't need to anticipate every form.

## Reading the report

Console:

```
category              P       R       F1      tp    fp    fn    expected  extracted
personal-chat         85.7%   75.0%   80.0%   9     2     3     12        11
journal               90.0%   72.0%   80.0%   18    2     7     25        20
…
OVERALL               87.5%   72.4%   79.2%   42    6     16    58        48
```

- **P (Precision)** — of what the distiller extracted, what fraction was right (high P = low hallucination)
- **R (Recall)** — of what should have been extracted, what fraction was found (high R = comprehensive coverage)
- **F1** — harmonic mean; the headline number to compare across prompt revisions

See ADR 0013 for full methodology, matcher semantics, and what's deferred to v0.2 (LLM-as-judge mode + CI integration + retrieval-quality eval).
