# mneme eval baseline — mem0-v3.0.3

> Distiller: `mem0-distiller` · Model: `claude-sonnet-4-6+text-embedding-3-small` · Started: 2026-05-20T10:11:37.619Z
> Duration: 227.2s · Distill cost: $0.0000 · Samples: 100
> Judge: `judge-claude:claude-haiku-4-5` · Judge model: `claude-haiku-4-5` · Judge cost: $2.0187

## Headline

| Metric | Strict (keyword) | Semantic (LLM-as-judge) |
| --- | ---: | ---: |
| Precision | 8.5% | 78.1% |
| Recall    | 8.6%    | 78.8%    |
| **F1**    | **8.5%**    | **78.5%**    |
| TP / FP / FN | 19 / 205 / 203 | 175 / 49 / 47 |
| Expected memories total | 222 | 222 |
| Extracted memories total | 224 | 224 |

## Per category — strict (keyword matcher)

| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domain-specific | 10.3% | 10.9% | 10.6% | 6 | 52 | 49 | 55 | 58 |
| edge-cases | 12.5% | 16.7% | 14.3% | 1 | 7 | 5 | 6 | 8 |
| journal | 3.7% | 4.3% | 4.0% | 2 | 52 | 44 | 46 | 54 |
| meeting-notes | 6.3% | 6.4% | 6.3% | 3 | 45 | 44 | 47 | 48 |
| personal-chat | 25.0% | 21.2% | 23.0% | 7 | 21 | 26 | 33 | 28 |
| slack | 0.0% | 0.0% | 0.0% | 0 | 28 | 35 | 35 | 28 |

## Per category — semantic (LLM-as-judge)

| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domain-specific | 82.8% | 87.3% | 85.0% | 48 | 10 | 7 | 55 | 58 |
| edge-cases | 50.0% | 66.7% | 57.1% | 4 | 4 | 2 | 6 | 8 |
| journal | 74.1% | 87.0% | 80.0% | 40 | 14 | 6 | 46 | 54 |
| meeting-notes | 77.1% | 78.7% | 77.9% | 37 | 11 | 10 | 47 | 48 |
| personal-chat | 85.7% | 72.7% | 78.7% | 24 | 4 | 9 | 33 | 28 |
| slack | 78.6% | 62.9% | 69.8% | 22 | 6 | 13 | 35 | 28 |
