import type { AggregateMetrics, EvalReport, SampleResult } from './types'

/**
 * Render the report as a human-readable console table. Two sections:
 *   - per-category aggregate (precision / recall / F1 / counts)
 *   - overall headline
 *
 * Any per-sample errors are listed in a final block so they're impossible
 * to miss when scanning the output.
 */
export function renderConsole(report: EvalReport): string {
  const lines: string[] = []
  const rule = '═'.repeat(79)
  const sub = '─'.repeat(79)
  lines.push(rule)
  lines.push(
    `mneme eval — distiller=${report.distillerName}  model=${report.model}  prompt=${report.promptVersion}`,
  )
  lines.push(rule)
  lines.push(
    `samples: ${report.samples.length}    duration: ${(report.durationMs / 1000).toFixed(1)}s    cost: $${report.totalCostUsdEstimate.toFixed(4)}`,
  )
  lines.push('')
  lines.push('per category:')
  lines.push(sub)
  lines.push(
    pad('category', 22) +
      pad('P', 8) +
      pad('R', 8) +
      pad('F1', 8) +
      pad('tp', 6) +
      pad('fp', 6) +
      pad('fn', 6) +
      pad('expected', 10) +
      pad('extracted', 10),
  )
  for (const [category, m] of sortedEntries(report.byCategory)) {
    lines.push(metricRow(category, m))
  }
  lines.push(sub)
  lines.push(metricRow('OVERALL', report.overall))
  lines.push(rule)

  const errors = report.samples.filter((s) => s.error)
  if (errors.length > 0) {
    lines.push('')
    lines.push(`per-sample errors (${errors.length}):`)
    lines.push(sub)
    for (const e of errors) {
      lines.push(`  ${e.sampleId.padEnd(28)} ${truncate(e.error ?? '', 80)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

/**
 * Render the report as a markdown baseline document suitable for committing
 * to `tests/eval/baselines/`. Stable formatting — diffs read cleanly in PRs.
 */
export function renderMarkdown(report: EvalReport): string {
  const lines: string[] = []
  lines.push(`# mneme eval baseline — ${report.promptVersion}`)
  lines.push('')
  lines.push(
    `> Distiller: \`${report.distillerName}\` · Model: \`${report.model}\` · Started: ${report.startedAt}`,
  )
  lines.push(
    `> Duration: ${(report.durationMs / 1000).toFixed(1)}s · Cost: $${report.totalCostUsdEstimate.toFixed(4)} · Samples: ${report.samples.length}`,
  )
  lines.push('')
  lines.push('## Headline')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Precision | ${fmtPct(report.overall.precision)} |`)
  lines.push(`| Recall | ${fmtPct(report.overall.recall)} |`)
  lines.push(`| F1 | ${fmtPct(report.overall.f1)} |`)
  lines.push(`| Expected memories total | ${report.overall.expectedTotal} |`)
  lines.push(`| Extracted memories total | ${report.overall.extractedTotal} |`)
  lines.push(
    `| TP / FP / FN | ${report.overall.tp} / ${report.overall.fp} / ${report.overall.fn} |`,
  )
  lines.push('')
  lines.push('## Per category')
  lines.push('')
  lines.push('| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const [category, m] of sortedEntries(report.byCategory)) {
    lines.push(
      `| ${category} | ${fmtPct(m.precision)} | ${fmtPct(m.recall)} | ${fmtPct(m.f1)} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.expectedTotal} | ${m.extractedTotal} |`,
    )
  }
  const errors = report.samples.filter((s) => s.error)
  if (errors.length > 0) {
    lines.push('')
    lines.push(`## Per-sample errors (${errors.length})`)
    lines.push('')
    for (const e of errors) lines.push(`- \`${e.sampleId}\` — ${e.error}`)
  }
  lines.push('')
  return `${lines.join('\n')}`
}

/**
 * Render the full structured report as JSON. Pretty-printed (2-space indent)
 * so it diffs readably under git. Stable key order (insertion order).
 */
export function renderJson(report: EvalReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

function metricRow(name: string, m: AggregateMetrics): string {
  return (
    pad(name, 22) +
    pad(fmtPct(m.precision), 8) +
    pad(fmtPct(m.recall), 8) +
    pad(fmtPct(m.f1), 8) +
    pad(String(m.tp), 6) +
    pad(String(m.fp), 6) +
    pad(String(m.fn), 6) +
    pad(String(m.expectedTotal), 10) +
    pad(String(m.extractedTotal), 10)
  )
}

function pad(s: string, width: number): string {
  if (s.length >= width) return `${s} `
  return s + ' '.repeat(width - s.length)
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function sortedEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
}

/**
 * Compare two reports and produce a regression-style summary. Used by CI
 * gating once it lands (ADR 0013 §7). NaN-safe; works even when one report
 * has categories the other doesn't.
 */
export function diff(before: EvalReport, after: EvalReport): string {
  const lines: string[] = []
  const delta = (a: number, b: number): string => {
    const d = (b - a) * 100
    const sign = d >= 0 ? '+' : ''
    return `${sign}${d.toFixed(1)}%`
  }
  lines.push(`eval diff — prompt ${before.promptVersion} → ${after.promptVersion}`)
  lines.push('─'.repeat(60))
  lines.push(
    `F1:        ${fmtPct(before.overall.f1)} → ${fmtPct(after.overall.f1)}   (Δ ${delta(before.overall.f1, after.overall.f1)})`,
  )
  lines.push(
    `Precision: ${fmtPct(before.overall.precision)} → ${fmtPct(after.overall.precision)}   (Δ ${delta(before.overall.precision, after.overall.precision)})`,
  )
  lines.push(
    `Recall:    ${fmtPct(before.overall.recall)} → ${fmtPct(after.overall.recall)}   (Δ ${delta(before.overall.recall, after.overall.recall)})`,
  )
  return `${lines.join('\n')}\n`
}

/** Default file paths for the three outputs. */
export function reportPaths(
  report: EvalReport,
  rootDir: string,
): {
  jsonReport: string
  markdownReport: string
} {
  const stamp = report.startedAt.replace(/[:.]/g, '-')
  const slug = `${stamp}__${report.promptVersion}__${report.model}`.replace(/[^a-zA-Z0-9._-]/g, '_')
  return {
    jsonReport: `${rootDir}/reports/${slug}.json`,
    markdownReport: `${rootDir}/baselines/${report.promptVersion}__${report.model}.md`,
  }
}

// Re-export SampleResult so callers don't need both imports
export type { SampleResult }
