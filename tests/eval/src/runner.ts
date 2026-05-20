import type { Distiller, ExtractedMemory } from '@mnemehq/sdk'
import { type Matcher, assign, keywordMatcher, metrics } from './matcher'
import type { AggregateMetrics, CorpusSample, EvalReport, SampleResult, ScoreBlock } from './types'

export type RunEvalOptions = {
  /** The corpus to run. Loaded from `loadCorpus()` or constructed in tests. */
  corpus: CorpusSample[]
  /** Distiller adapter under test. */
  distiller: Distiller
  /**
   * Optional semantic-equivalence judge (ADR 0014). When set, every sample
   * is scored TWICE — once by the deterministic strict keyword matcher
   * (always run) and once by this matcher. Both sets of metrics land in
   * the same report so they can be compared side-by-side.
   */
  judge?: Matcher
  /**
   * Hard cap on USD spend (distillation only — judge cost is tracked
   * separately on the report). Default Infinity (no cap).
   */
  maxCostUsd?: number
  /**
   * How many samples to distill in parallel. Default 4 — conservative
   * against Anthropic tier-1 rate limits. Set to 1 for sequential /
   * deterministic runs.
   *
   * Note: when judge is enabled, each sample's judge calls are issued
   * SEQUENTIALLY within the sample so the prompt-cache hit rate stays high.
   * Cross-sample parallelism still respects this knob.
   */
  concurrency?: number
  /** Per-sample timeout in ms (distillation + scoring). Default 60_000. */
  perSampleTimeoutMs?: number
  /** Observability hook fired as each sample finishes. */
  onSampleComplete?: (result: SampleResult, index: number, total: number) => void
}

/**
 * Run the full eval. Returns a structured {@link EvalReport}. Never throws
 * for per-sample failures — those are recorded in the result with an `error`
 * field. Throws only for invariant violations.
 */
export async function runEval(options: RunEvalOptions): Promise<EvalReport> {
  const {
    corpus,
    distiller,
    judge,
    maxCostUsd = Number.POSITIVE_INFINITY,
    concurrency = 4,
    perSampleTimeoutMs = 60_000,
    onSampleComplete,
  } = options

  if (corpus.length === 0) throw new Error('runEval: corpus is empty')
  if (concurrency < 1) throw new Error('runEval: concurrency must be >= 1')

  const startedAt = new Date().toISOString()
  const startMs = performance.now()
  const results: SampleResult[] = new Array(corpus.length)
  let cumulativeDistillCost = 0
  let cumulativeJudgeCost = 0
  let cursor = 0
  let aborted = false

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++
      if (index >= corpus.length) return
      const sample = corpus[index]
      if (!sample) continue

      // Cost-budget check applies to distillation only. Once exceeded, every
      // remaining sample is marked as skipped so the report tells the story.
      if (aborted || cumulativeDistillCost >= maxCostUsd) {
        aborted = true
        results[index] = budgetSkipResult(sample, 'cost budget exceeded before this sample started')
        onSampleComplete?.(results[index] as SampleResult, index, corpus.length)
        continue
      }

      const sampleStart = performance.now()
      const emptyBlock: ScoreBlock = {
        tp: 0,
        fp: 0,
        fn: sample.expected.length,
        matchedExpected: [],
        matchedExtracted: [],
      }
      const result: SampleResult = {
        sampleId: sample.id,
        category: sample.category,
        extracted: [],
        strict: { ...emptyBlock, matchedExpected: [], matchedExtracted: [] },
        costUsdEstimate: 0,
        durationMs: 0,
      }
      if (judge) result.judgeCostUsdEstimate = 0

      try {
        const output = await Promise.race([
          distiller.distill({ text: sample.input }),
          timeoutAfter(perSampleTimeoutMs, sample.id),
        ])
        result.extracted = output.extracted as ExtractedMemory[]
        result.costUsdEstimate = output.usage.costUsdEstimate
        cumulativeDistillCost += output.usage.costUsdEstimate

        // Strict scoring — always runs, free, deterministic.
        const strictAssign = await assign(result.extracted, sample.expected, keywordMatcher)
        result.strict = {
          tp: strictAssign.tp,
          fp: strictAssign.fp,
          fn: strictAssign.fn,
          matchedExpected: strictAssign.matchedExpected,
          matchedExtracted: strictAssign.matchedExtracted,
        }

        // Semantic scoring — opt-in via `judge`.
        if (judge) {
          const judgeCostBefore = readJudgeCost(judge)
          const semanticAssign = await assign(result.extracted, sample.expected, judge)
          result.semantic = {
            tp: semanticAssign.tp,
            fp: semanticAssign.fp,
            fn: semanticAssign.fn,
            matchedExpected: semanticAssign.matchedExpected,
            matchedExtracted: semanticAssign.matchedExtracted,
          }
          const judgeCostDelta = readJudgeCost(judge) - judgeCostBefore
          result.judgeCostUsdEstimate = roundCost(judgeCostDelta)
          cumulativeJudgeCost += judgeCostDelta
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err)
      }

      result.durationMs = Math.round(performance.now() - sampleStart)
      results[index] = result
      onSampleComplete?.(result, index, corpus.length)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, corpus.length) }, () => worker())
  await Promise.all(workers)

  for (let i = 0; i < corpus.length; i++) {
    const s = corpus[i]
    if (!s) continue
    if (!results[i]) {
      results[i] = budgetSkipResult(
        s,
        'sample slot left empty by runner; please report this as a bug',
      )
    }
  }

  const finishedAt = new Date().toISOString()
  const durationMs = Math.round(performance.now() - startMs)
  const usingJudge = judge !== undefined

  const report: EvalReport = {
    startedAt,
    finishedAt,
    promptVersion: distillerPromptVersion(distiller),
    model: distiller.model,
    distillerName: distiller.name,
    durationMs,
    totalCostUsdEstimate: roundCost(cumulativeDistillCost),
    samples: results,
    strict: aggregate(results, 'strict'),
    strictByCategory: aggregateByCategory(results, 'strict'),
    ...(usingJudge
      ? {
          semantic: aggregate(results, 'semantic'),
          semanticByCategory: aggregateByCategory(results, 'semantic'),
          judge: {
            name: judge.name,
            model: judgeModel(judge),
            totalCostUsdEstimate: roundCost(cumulativeJudgeCost),
          },
        }
      : {}),
  }
  return report
}

function aggregate(results: SampleResult[], which: 'strict' | 'semantic'): AggregateMetrics {
  let tp = 0
  let fp = 0
  let fn = 0
  let expectedTotal = 0
  let extractedTotal = 0
  for (const r of results) {
    const block = which === 'strict' ? r.strict : r.semantic
    if (!block) continue
    tp += block.tp
    fp += block.fp
    fn += block.fn
    extractedTotal += r.extracted.length
    expectedTotal += block.tp + block.fn
  }
  const { precision, recall, f1 } = metrics(tp, fp, fn)
  return {
    sampleCount: results.length,
    expectedTotal,
    extractedTotal,
    tp,
    fp,
    fn,
    precision,
    recall,
    f1,
  }
}

function aggregateByCategory(
  results: SampleResult[],
  which: 'strict' | 'semantic',
): Record<string, AggregateMetrics> {
  const buckets = new Map<string, SampleResult[]>()
  for (const r of results) {
    const arr = buckets.get(r.category) ?? []
    arr.push(r)
    buckets.set(r.category, arr)
  }
  const out: Record<string, AggregateMetrics> = {}
  for (const [category, arr] of buckets) out[category] = aggregate(arr, which)
  return out
}

function budgetSkipResult(sample: CorpusSample, errMsg: string): SampleResult {
  return {
    sampleId: sample.id,
    category: sample.category,
    extracted: [],
    strict: { tp: 0, fp: 0, fn: sample.expected.length, matchedExpected: [], matchedExtracted: [] },
    costUsdEstimate: 0,
    durationMs: 0,
    error: errMsg,
  }
}

function timeoutAfter(ms: number, sampleId: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`distill timed out after ${ms}ms (sample ${sampleId})`)), ms),
  )
}

function distillerPromptVersion(distiller: Distiller): string {
  const maybeVersion = (distiller as unknown as { promptVersion?: string }).promptVersion
  return typeof maybeVersion === 'string' && maybeVersion.length > 0 ? maybeVersion : 'unknown'
}

function readJudgeCost(judge: Matcher): number {
  const maybe = (judge as unknown as { totalCostUsdEstimate?: number }).totalCostUsdEstimate
  return typeof maybe === 'number' ? maybe : 0
}

function judgeModel(judge: Matcher): string {
  const maybe = (judge as unknown as { model?: string }).model
  return typeof maybe === 'string' ? maybe : 'unknown'
}

function roundCost(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
