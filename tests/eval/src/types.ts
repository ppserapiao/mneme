import type { MemoryKind } from '@mnemehq/protocol'
import type { ExtractedMemory } from '@mnemehq/sdk'

/**
 * One entry in the eval corpus. Stored as a single line of JSONL under
 * `tests/eval/corpus/<category>.jsonl`. Hand-curated; reviewed via PR.
 */
export type CorpusSample = {
  /** Stable identifier, e.g. `personal-chat-001`. Used in reports + diffs. */
  id: string
  /** Category bucket — used for sliced reporting. */
  category: string
  /** Raw text fed to `mneme.distill()`. */
  input: string
  /** Ground-truth memories a good distiller should produce. */
  expected: ExpectedMemory[]
  /** Optional human-readable note about what this sample is testing. */
  notes?: string
}

/**
 * Ground-truth specification for a single expected extraction. The matcher
 * scores TP if SOME extracted memory has the same `kind`, contains every
 * `mustInclude` keyword (case-insensitive substring), and contains none of
 * the `mustNotInclude` anti-patterns (strict matcher) or is judged
 * semantically equivalent by the LLM-as-judge (semantic matcher, ADR 0014).
 *
 * Picking `mustInclude` keywords is a craft: prefer broad stems ("allerg"
 * rather than "allergic") so legitimate phrasing variation still scores TP.
 */
export type ExpectedMemory = {
  kind: MemoryKind
  /** Human-readable summary of what should be extracted. For reporting. */
  gist: string
  /** Substrings the extracted body MUST contain (case-insensitive). */
  mustInclude: string[]
  /** Substrings the extracted body must NOT contain. Optional. */
  mustNotInclude?: string[]
}

/**
 * Per-matcher score block (ADR 0014). Each sample is scored by the strict
 * keyword matcher; optionally also by the LLM-as-judge.
 */
export type ScoreBlock = {
  tp: number
  fp: number
  fn: number
  /** Indices into `expected[]` that found a match under this matcher. */
  matchedExpected: number[]
  /** Indices into `extracted[]` that found a match under this matcher. */
  matchedExtracted: number[]
}

/**
 * Result of matching one sample's extracted memories against expectations.
 * `strict` is always present (keyword matcher is free + deterministic);
 * `semantic` is present only when `--judge` was passed.
 */
export type SampleResult = {
  sampleId: string
  category: string
  /** Memories the distiller produced for this sample. */
  extracted: ExtractedMemory[]
  /** Strict keyword-matcher scores. Always present. */
  strict: ScoreBlock
  /** Semantic LLM-judge scores. Present only when --judge was enabled. */
  semantic?: ScoreBlock
  /** Distillation cost for this sample (one Anthropic call). */
  costUsdEstimate: number
  /** Per-sample judge cost (sum of all pair-judge calls). 0 when no judge. */
  judgeCostUsdEstimate?: number
  /** Wall-clock duration including distillation + matching. */
  durationMs: number
  /** Any per-sample error encountered. Sample-level failures don't abort the run. */
  error?: string
}

/**
 * Aggregated result over the whole corpus (or a sliced subset like by category).
 */
export type AggregateMetrics = {
  /** Number of samples included in this aggregate. */
  sampleCount: number
  /** Sum of expected memories across all samples. */
  expectedTotal: number
  /** Sum of extracted memories across all samples. */
  extractedTotal: number
  tp: number
  fp: number
  fn: number
  /** TP / (TP + FP). Range [0, 1]. NaN-safe (returns 0 when denominator is 0). */
  precision: number
  /** TP / (TP + FN). */
  recall: number
  /** Harmonic mean of precision and recall. */
  f1: number
}

/**
 * Full structured report from a single eval run. Written to
 * `tests/eval/reports/<timestamp>-<promptVersion>-<model>.json` and the
 * baseline equivalent in `tests/eval/baselines/`.
 */
export type EvalReport = {
  /** ISO timestamp when the run started. */
  startedAt: string
  /** ISO timestamp when the run finished. */
  finishedAt: string
  /** PROMPT_VERSION constant from the distiller adapter. */
  promptVersion: string
  /** Model identifier the distiller is configured for. */
  model: string
  /** Distiller adapter name (e.g. `claude-distiller` or `mock-distiller`). */
  distillerName: string
  /** Total wall-clock ms. */
  durationMs: number
  /** Sum of per-sample distillation cost estimates. */
  totalCostUsdEstimate: number
  /** All per-sample results, in the order they were run. */
  samples: SampleResult[]
  /** Aggregated STRICT metrics over the full corpus. Always present. */
  strict: AggregateMetrics
  /** Aggregated SEMANTIC metrics. Present only when judge was enabled. */
  semantic?: AggregateMetrics
  /** Per-category strict aggregates. */
  strictByCategory: Record<string, AggregateMetrics>
  /** Per-category semantic aggregates. Present only when judge was enabled. */
  semanticByCategory?: Record<string, AggregateMetrics>
  /** Judge metadata. Present only when judge was enabled. */
  judge?: {
    name: string
    model: string
    totalCostUsdEstimate: number
  }
}
