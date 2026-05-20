# mneme eval baseline — 2026-05-20d

> Distiller: `claude-distiller` · Model: `claude-sonnet-4-6` · Started: 2026-05-20T02:07:07.582Z
> Duration: 63.2s · Distill cost: $0.1463 · Samples: 30
> Judge: `judge-claude:claude-haiku-4-5` · Judge model: `claude-haiku-4-5` · Judge cost: $0.4827

## Headline

| Metric | Strict (keyword) | Semantic (LLM-as-judge) |
| --- | ---: | ---: |
| Precision | 69.8% | 82.5% |
| Recall    | 66.7%    | 78.8%    |
| **F1**    | **68.2%**    | **80.6%**    |
| TP / FP / FN | 44 / 19 / 22 | 52 / 11 / 14 |
| Expected memories total | 66 | 66 |
| Extracted memories total | 63 | 63 |

## Per category — strict (keyword matcher)

| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domain-specific | 64.3% | 60.0% | 62.1% | 9 | 5 | 6 | 15 | 14 |
| edge-cases | 100.0% | 66.7% | 80.0% | 2 | 0 | 1 | 3 | 2 |
| journal | 62.5% | 66.7% | 64.5% | 10 | 6 | 5 | 15 | 16 |
| meeting-notes | 62.5% | 71.4% | 66.7% | 10 | 6 | 4 | 14 | 16 |
| personal-chat | 90.0% | 81.8% | 85.7% | 9 | 1 | 2 | 11 | 10 |
| slack | 80.0% | 50.0% | 61.5% | 4 | 1 | 4 | 8 | 5 |

## Per category — semantic (LLM-as-judge)

| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domain-specific | 85.7% | 80.0% | 82.8% | 12 | 2 | 3 | 15 | 14 |
| edge-cases | 100.0% | 66.7% | 80.0% | 2 | 0 | 1 | 3 | 2 |
| journal | 81.3% | 86.7% | 83.9% | 13 | 3 | 2 | 15 | 16 |
| meeting-notes | 75.0% | 85.7% | 80.0% | 12 | 4 | 2 | 14 | 16 |
| personal-chat | 90.0% | 81.8% | 85.7% | 9 | 1 | 2 | 11 | 10 |
| slack | 80.0% | 50.0% | 61.5% | 4 | 1 | 4 | 8 | 5 |
