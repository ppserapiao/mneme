# mneme eval baseline — 2026-05-20d

> Distiller: `claude-distiller` · Model: `claude-sonnet-4-6` · Started: 2026-05-20T02:28:12.894Z
> Duration: 187.8s · Distill cost: $0.4437 · Samples: 100
> Judge: `judge-claude:claude-haiku-4-5` · Judge model: `claude-haiku-4-5` · Judge cost: $1.8181

## Headline

| Metric | Strict (keyword) | Semantic (LLM-as-judge) |
| --- | ---: | ---: |
| Precision | 59.0% | 73.9% |
| Recall    | 66.2%    | 82.9%    |
| **F1**    | **62.4%**    | **78.1%**    |
| TP / FP / FN | 147 / 102 / 75 | 184 / 65 / 38 |
| Expected memories total | 222 | 222 |
| Extracted memories total | 249 | 249 |

## Per category — strict (keyword matcher)

| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domain-specific | 62.3% | 69.1% | 65.5% | 38 | 23 | 17 | 55 | 61 |
| edge-cases | 40.0% | 33.3% | 36.4% | 2 | 3 | 4 | 6 | 5 |
| journal | 57.1% | 69.6% | 62.7% | 32 | 24 | 14 | 46 | 56 |
| meeting-notes | 58.2% | 68.1% | 62.7% | 32 | 23 | 15 | 47 | 55 |
| personal-chat | 62.9% | 66.7% | 64.7% | 22 | 13 | 11 | 33 | 35 |
| slack | 56.8% | 60.0% | 58.3% | 21 | 16 | 14 | 35 | 37 |

## Per category — semantic (LLM-as-judge)

| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domain-specific | 83.6% | 92.7% | 87.9% | 51 | 10 | 4 | 55 | 61 |
| edge-cases | 80.0% | 66.7% | 72.7% | 4 | 1 | 2 | 6 | 5 |
| journal | 75.0% | 91.3% | 82.4% | 42 | 14 | 4 | 46 | 56 |
| meeting-notes | 67.3% | 78.7% | 72.5% | 37 | 18 | 10 | 47 | 55 |
| personal-chat | 71.4% | 75.8% | 73.5% | 25 | 10 | 8 | 33 | 35 |
| slack | 67.6% | 71.4% | 69.4% | 25 | 12 | 10 | 35 | 37 |
