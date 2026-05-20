import type { Distiller, ExtractedMemory } from '@mnemehq/sdk'
import { assign, metrics } from './matcher'
import type { AggregateMetrics, CorpusSample, EvalReport, SampleResult } from './types'

export type RunEvalOptions = {
  /** The corpus to run. Loaded from `loadCorpus()` or constructed in tests. */
  corpus: CorpusSample[]
  /** Distiller adapter under test. */
  distiller: Distiller
  /**
   * Hard cap on USD spend. The runner skips any sample whose start would
   * push cumulative cost over this number. Default Infinity (no cap).
   */
  maxCostUsd?: number
  /**
   * How many samples to distill in parallel. Default 4 — conservative against
   * Anthropic tier-1 rate limits. Set to 1 for sequential / deterministic runs.
   */
  concurrency?: number
  /**
   * Per-sample timeout in ms. Samples exceeding this are recorded as errors
   * but do NOT abort the whole run. Default 60_000.
   */
  perSampleTimeoutMs?: number
  /**
   * Observability hook fired as each sample finishes (success or failure).
   * Useful for live progress in the CLI.
   */
  onSampleComplete?: (result: SampleResult, index: number, total: number) => void
}

/**
 * Run the full eval. Returns a structured {@link EvalReport}. Never throws
 * for per-sample failures — those are recorded in the result with an `error`
 * field. Throws only for invariant violations (distiller object is broken,
 * corpus is empty, etc.).
 */
export async function runEval(options: RunEvalOptions): Promise<EvalReport> {
  const {
    corpus,
    distiller,
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
  let cumulativeCost = 0
  let cursor = 0
  let aborted = false

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++
      if (index >= corpus.length) return
      const sample = corpus[index]
      if (!sample) continue

      // Cost budget check — once exceeded, mark this AND every remaining
      // sample as skipped so the report explains why nothing more ran.
      // Workers continue iterating to drain the queue rather than exiting
      // (which would leave gaps for other workers to backfill ambiguously).
      if (aborted || cumulativeCost >= maxCostUsd) {
        aborted = true
        results[index] = budgetSkipResult(sample, 'cost budget exceeded before this sample started')
        onSampleComplete?.(results[index] as SampleResult, index, corpus.length)
        continue
      }

      const sampleStart = performance.now()
      const result: SampleResult = {
        sampleId: sample.id,
        category: sample.category,
        extracted: [],
        matchedExpected: [],
        matchedExtracted: [],
        tp: 0,
        fp: 0,
        fn: sample.expected.length,
        costUsdEstimate: 0,
        durationMs: 0,
      }

      try {
        const output = await Promise.race([
          distiller.distill({ text: sample.input }),
          timeoutAfter(perSampleTimeoutMs, sample.id),
        ])
        result.extracted = output.extracted as ExtractedMemory[]
        result.costUsdEstimate = output.usage.costUsdEstimate
        cumulativeCost += output.usage.costUsdEstimate
        const assignment = assign(result.extracted, sample.expected)
        result.matchedExpected = assignment.matchedExpected
        result.matchedExtracted = assignment.matchedExtracted
        result.tp = assignment.tp
        result.fp = assignment.fp
        result.fn = assignment.fn
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

  // Backfill any missing slots (shouldn't happen, but defence in depth)
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

  return {
    startedAt,
    finishedAt,
    promptVersion: distillerPromptVersion(distiller),
    model: distiller.model,
    distillerName: distiller.name,
    durationMs,
    totalCostUsdEstimate: roundCost(cumulativeCost),
    samples: results,
    overall: aggregate(results),
    byCategory: aggregateByCategory(results),
  }
}

function aggregate(results: SampleResult[]): AggregateMetrics {
  let tp = 0
  let fp = 0
  let fn = 0
  let expectedTotal = 0
  let extractedTotal = 0
  for (const r of results) {
    tp += r.tp
    fp += r.fp
    fn += r.fn
    extractedTotal += r.extracted.length
    expectedTotal += r.tp + r.fn
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

function aggregateByCategory(results: SampleResult[]): Record<string, AggregateMetrics> {
  const buckets = new Map<string, SampleResult[]>()
  for (const r of results) {
    const arr = buckets.get(r.category) ?? []
    arr.push(r)
    buckets.set(r.category, arr)
  }
  const out: Record<string, AggregateMetrics> = {}
  for (const [category, arr] of buckets) out[category] = aggregate(arr)
  return out
}

function budgetSkipResult(sample: CorpusSample, errMsg: string): SampleResult {
  return {
    sampleId: sample.id,
    category: sample.category,
    extracted: [],
    matchedExpected: [],
    matchedExtracted: [],
    tp: 0,
    fp: 0,
    fn: sample.expected.length,
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

/**
 * Best-effort prompt-version lookup. We don't want to hard-require the
 * adapter to expose this — for tests with a mock distiller we accept that
 * the report has `promptVersion: 'unknown'`.
 */
function distillerPromptVersion(distiller: Distiller): string {
  const maybeVersion = (distiller as unknown as { promptVersion?: string }).promptVersion
  return typeof maybeVersion === 'string' && maybeVersion.length > 0 ? maybeVersion : 'unknown'
}

function roundCost(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
