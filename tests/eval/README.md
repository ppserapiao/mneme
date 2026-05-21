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

Cost ceiling defaults to **$5** per run. Sonnet-with-prompt-caching pays roughly £0.30-£0.60 for the full 100-sample corpus.

### Comparative eval (vs Mem0, ADR 0015)

To run the same corpus through a competitor system:

```sh
# 1. Start Qdrant (Mem0's production vector store — required because Mem0's
#    in-memory default uses better-sqlite3 which Bun does not support)
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
curl -s http://localhost:6333/readyz   # expect: ready

# 2. Export both keys (Mem0 = Anthropic LLM + OpenAI embeddings)
export ANTHROPIC_API_KEY='sk-ant-...'
export OPENAI_API_KEY='sk-...'

# 3. Run
bun run eval:live -- --distiller=mem0 --judge=claude
```

The CLI runs a Qdrant preflight before any LLM call, so a missing Docker container costs $0. Override the Qdrant URL with `QDRANT_URL=http://host:port` if needed.

## Layout

```
tests/eval/
├── corpus/                    ← 6 categories, 100 samples, 222 expected memories
│   ├── personal-chat.jsonl    ← 17 samples / 33 expected
│   ├── journal.jsonl          ← 17 samples / 46 expected
│   ├── slack.jsonl            ← 20 samples / 35 expected (deepest — slack is the genuine model weakness per dual-matcher baseline)
│   ├── meeting-notes.jsonl    ← 17 samples / 47 expected
│   ├── edge-cases.jsonl       ← 12 samples / 6 expected (negative tests; most expected are zero)
│   └── domain-specific.jsonl  ← 17 samples / 55 expected (developer, designer, health, travel, family, finance, fitness, cooking, music, gaming, learning, legal)
├── baselines/                 ← committed reference reports (one per prompt × model)
│   └── README.md              ← contract for baseline updates
├── reports/                   ← per-run JSON outputs (gitignored)
└── src/
    ├── types.ts               ← CorpusSample, ExpectedMemory, EvalReport, ScoreBlock, ...
    ├── corpus.ts              ← JSONL loader + per-line validator
    ├── matcher.ts             ← Matcher interface, keywordMatcher, async assign(), metrics
    ├── judge.ts               ← ClaudeJudgeMatcher (ADR 0014) — Anthropic-backed semantic equivalence
    ├── runner.ts              ← runEval — concurrency, cost budget, dual-matcher scoring, failure isolation
    ├── reporter.ts            ← renderConsole, renderMarkdown (dual-matcher side-by-side), renderJson, diff
    ├── cli.ts                 ← bun run eval entry point with --judge=claude flag
    └── *.test.ts              ← unit tests (mock distiller + stubbed Anthropic, no real API calls)
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
