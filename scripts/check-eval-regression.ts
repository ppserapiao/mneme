#!/usr/bin/env bun
/**
 * Compares the latest eval report against the committed baseline and fails
 * if strict F1 regressed more than the allowed threshold.
 *
 * Designed to run after `bun run eval:baseline -- --judge=claude` inside the
 * eval-regression CI workflow.
 *
 * Why strict and not semantic: strict matching is deterministic across runs;
 * semantic depends on a stochastic judge and would create false-positive
 * regressions. We gate on strict and report semantic for context.
 *
 * Exit codes:
 *   0 — strict F1 stable (within tolerance) or improved
 *   1 — strict F1 regressed beyond tolerance, OR no baseline / report found
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const REPORTS_DIR = 'tests/eval/reports'
const BASELINES_DIR = 'tests/eval/baselines'
const TOLERANCE_PCT = 2.0 // pp drop allowed before failing
// The mneme-side distiller registers itself as `claude-distiller` in the eval
// runner (it's the @mnemehq/distiller-claude implementation), so baselines
// and reports for our own quality are suffixed accordingly. Mem0 reports
// use `__mem0-distiller` and are intentionally excluded.
const DISTILLER_MD_SUFFIX = '__claude-distiller.md'
const DISTILLER_JSON_SUFFIX = '__claude-distiller.json'

type JsonReport = {
  metrics: {
    strict: { precision: number; recall: number; f1: number }
    semantic?: { precision: number; recall: number; f1: number } | null
  }
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`)
  process.exit(1)
}

function ok(msg: string): never {
  console.log(`\n✅ ${msg}\n`)
  process.exit(0)
}

// --- 1. Find the most recent JSON report ---
let reports: string[]
try {
  reports = readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith(DISTILLER_JSON_SUFFIX))
    .sort()
} catch (err) {
  fail(`Could not read ${REPORTS_DIR}: ${(err as Error).message}`)
}
if (reports.length === 0) {
  fail(`No claude-distiller JSON reports found in ${REPORTS_DIR}. Did the eval run?`)
}
const latestReport = reports[reports.length - 1]
if (!latestReport) {
  fail('No latest report — unreachable.')
}
const reportPath = join(REPORTS_DIR, latestReport)

// --- 2. Parse it ---
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as JsonReport
const newStrictF1 = report.metrics.strict.f1 * 100
const newSemanticF1 = report.metrics.semantic ? report.metrics.semantic.f1 * 100 : null

// --- 3. Find the most recent committed baseline for the mneme distiller ---
let baselines: string[]
try {
  baselines = readdirSync(BASELINES_DIR)
    .filter((f) => f.endsWith(DISTILLER_MD_SUFFIX))
    .sort()
} catch (err) {
  fail(`Could not read ${BASELINES_DIR}: ${(err as Error).message}`)
}
if (baselines.length === 0) {
  fail(`No claude-distiller baselines in ${BASELINES_DIR}. Cannot compare.`)
}
const baselineFile = baselines[baselines.length - 1]
if (!baselineFile) {
  fail('No baseline file — unreachable.')
}
const baselineMd = readFileSync(join(BASELINES_DIR, baselineFile), 'utf8')

// --- 4. Extract baseline strict F1 from the markdown table ---
// Format: "| **F1**    | **62.4%**    | **78.1%**    |"
// We grab the first ** wrapped percentage on the F1 row (strict column).
const f1Row = baselineMd.split('\n').find((line) => /\*\*F1\*\*/i.test(line))
if (!f1Row) {
  fail(`Could not locate F1 row in baseline ${baselineFile}`)
}
const matches = f1Row.match(/\*\*([\d.]+)%\*\*/g)
if (!matches || matches.length === 0) {
  fail(`Could not parse F1 percentages from baseline row: ${f1Row}`)
}
const baselineStrictF1 = Number.parseFloat(matches[0].replace(/[*%]/g, ''))
const baselineSemanticF1 = matches[1] ? Number.parseFloat(matches[1].replace(/[*%]/g, '')) : null

// --- 5. Compare and report ---
const strictDrop = baselineStrictF1 - newStrictF1
const strictDelta = strictDrop > 0 ? `-${strictDrop.toFixed(1)}` : `+${(-strictDrop).toFixed(1)}`

console.log('=== EVAL REGRESSION CHECK ===')
console.log(`Baseline file: ${baselineFile}`)
console.log(`Report file:   ${latestReport}`)
console.log('')
console.log(
  `Strict F1:   baseline ${baselineStrictF1.toFixed(1)}% → new ${newStrictF1.toFixed(1)}% (${strictDelta} pp)`,
)
if (newSemanticF1 !== null && baselineSemanticF1 !== null) {
  const semanticDelta = (newSemanticF1 - baselineSemanticF1).toFixed(1)
  const sign = newSemanticF1 >= baselineSemanticF1 ? '+' : ''
  console.log(
    `Semantic F1: baseline ${baselineSemanticF1.toFixed(1)}% → new ${newSemanticF1.toFixed(1)}% (${sign}${semanticDelta} pp, informational only)`,
  )
}
console.log(`Tolerance:   ${TOLERANCE_PCT.toFixed(1)} pp`)
console.log('')

if (strictDrop > TOLERANCE_PCT) {
  fail(
    `Strict F1 regressed by ${strictDrop.toFixed(1)} pp (allowed ${TOLERANCE_PCT.toFixed(1)} pp). If this is intentional, update the baseline file in the same PR.`,
  )
}
ok(`Strict F1 within tolerance (${strictDelta} pp vs baseline).`)
