import type { AggregateMetrics, EvalReport } from './types'

/**
 * Render the report as a human-readable console table. When the judge was
 * enabled, prints two per-category tables side-by-side (strict + semantic)
 * so the comparison is impossible to miss.
 *
 * Any per-sample errors are listed in a final block.
 */
export function renderConsole(report: EvalReport): string {
  const lines: string[] = []
  const rule = '═'.repeat(79)
  const sub = '─'.repeat(79)
  lines.push(rule)
  lines.push(
    `mneme eval — distiller=${report.distillerName}  model=${report.model}  prompt=${report.promptVersion}`,
  )
  if (report.judge) {
    lines.push(`            judge=${report.judge.name}  judgeModel=${report.judge.model}`)
  }
  lines.push(rule)
  lines.push(
    `samples: ${report.samples.length}    duration: ${(report.durationMs / 1000).toFixed(1)}s    distill cost: $${report.totalCostUsdEstimate.toFixed(4)}${report.judge ? `    judge cost: $${report.judge.totalCostUsdEstimate.toFixed(4)}` : ''}`,
  )

  lines.push('')
  lines.push('per category — STRICT (keyword matcher):')
  lines.push(sub)
  lines.push(headerRow())
  for (const [category, m] of sortedEntries(report.strictByCategory)) {
    lines.push(metricRow(category, m))
  }
  lines.push(sub)
  lines.push(metricRow('OVERALL (strict)', report.strict))

  if (report.semantic && report.semanticByCategory) {
    lines.push('')
    lines.push('per category — SEMANTIC (LLM-as-judge):')
    lines.push(sub)
    lines.push(headerRow())
    for (const [category, m] of sortedEntries(report.semanticByCategory)) {
      lines.push(metricRow(category, m))
    }
    lines.push(sub)
    lines.push(metricRow('OVERALL (semantic)', report.semantic))
  }

  lines.push(rule)
  lines.push(
    `HEADLINE: strict F1 ${fmtPct(report.strict.f1)}${report.semantic ? `    semantic F1 ${fmtPct(report.semantic.f1)}` : ''}`,
  )
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
    `> Duration: ${(report.durationMs / 1000).toFixed(1)}s · Distill cost: $${report.totalCostUsdEstimate.toFixed(4)} · Samples: ${report.samples.length}`,
  )
  if (report.judge) {
    lines.push(
      `> Judge: \`${report.judge.name}\` · Judge model: \`${report.judge.model}\` · Judge cost: $${report.judge.totalCostUsdEstimate.toFixed(4)}`,
    )
  }
  lines.push('')
  lines.push('## Headline')
  lines.push('')

  if (report.semantic) {
    lines.push('| Metric | Strict (keyword) | Semantic (LLM-as-judge) |')
    lines.push('| --- | ---: | ---: |')
    lines.push(
      `| Precision | ${fmtPct(report.strict.precision)} | ${fmtPct(report.semantic.precision)} |`,
    )
    lines.push(
      `| Recall    | ${fmtPct(report.strict.recall)}    | ${fmtPct(report.semantic.recall)}    |`,
    )
    lines.push(
      `| **F1**    | **${fmtPct(report.strict.f1)}**    | **${fmtPct(report.semantic.f1)}**    |`,
    )
    lines.push(
      `| TP / FP / FN | ${report.strict.tp} / ${report.strict.fp} / ${report.strict.fn} | ${report.semantic.tp} / ${report.semantic.fp} / ${report.semantic.fn} |`,
    )
    lines.push(
      `| Expected memories total | ${report.strict.expectedTotal} | ${report.semantic.expectedTotal} |`,
    )
    lines.push(
      `| Extracted memories total | ${report.strict.extractedTotal} | ${report.semantic.extractedTotal} |`,
    )
  } else {
    lines.push('| Metric | Value |')
    lines.push('| --- | --- |')
    lines.push(`| Precision | ${fmtPct(report.strict.precision)} |`)
    lines.push(`| Recall | ${fmtPct(report.strict.recall)} |`)
    lines.push(`| F1 | ${fmtPct(report.strict.f1)} |`)
    lines.push(`| Expected memories total | ${report.strict.expectedTotal} |`)
    lines.push(`| Extracted memories total | ${report.strict.extractedTotal} |`)
    lines.push(`| TP / FP / FN | ${report.strict.tp} / ${report.strict.fp} / ${report.strict.fn} |`)
  }
  lines.push('')

  lines.push('## Per category — strict (keyword matcher)')
  lines.push('')
  lines.push('| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const [category, m] of sortedEntries(report.strictByCategory)) {
    lines.push(
      `| ${category} | ${fmtPct(m.precision)} | ${fmtPct(m.recall)} | ${fmtPct(m.f1)} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.expectedTotal} | ${m.extractedTotal} |`,
    )
  }

  if (report.semanticByCategory) {
    lines.push('')
    lines.push('## Per category — semantic (LLM-as-judge)')
    lines.push('')
    lines.push('| Category | P | R | F1 | TP | FP | FN | Expected | Extracted |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const [category, m] of sortedEntries(report.semanticByCategory)) {
      lines.push(
        `| ${category} | ${fmtPct(m.precision)} | ${fmtPct(m.recall)} | ${fmtPct(m.f1)} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.expectedTotal} | ${m.extractedTotal} |`,
      )
    }
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

export function renderJson(report: EvalReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

function headerRow(): string {
  return (
    pad('category', 22) +
    pad('P', 8) +
    pad('R', 8) +
    pad('F1', 8) +
    pad('tp', 6) +
    pad('fp', 6) +
    pad('fn', 6) +
    pad('expected', 10) +
    pad('extracted', 10)
  )
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
 * Compare two reports and produce a regression-style summary. Compares
 * strict F1 (the CI-gate metric). If either side has semantic too, also
 * includes a semantic delta.
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
    `Strict F1: ${fmtPct(before.strict.f1)} → ${fmtPct(after.strict.f1)}   (Δ ${delta(before.strict.f1, after.strict.f1)})`,
  )
  if (before.semantic && after.semantic) {
    lines.push(
      `Sem.   F1: ${fmtPct(before.semantic.f1)} → ${fmtPct(after.semantic.f1)}   (Δ ${delta(before.semantic.f1, after.semantic.f1)})`,
    )
  }
  return `${lines.join('\n')}\n`
}

/**
 * Naming convention: `<promptVersion>__<model>__<distillerName>.{md,json}`
 * — the distiller segment keeps Mem0 / Letta / Zep / etc. from clobbering
 * mneme's baseline (ADR 0015 §6).
 */
export function reportPaths(
  report: EvalReport,
  rootDir: string,
): { jsonReport: string; markdownReport: string } {
  const stamp = report.startedAt.replace(/[:.]/g, '-')
  const slug =
    `${stamp}__${report.promptVersion}__${report.model}__${report.distillerName}`.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    )
  return {
    jsonReport: `${rootDir}/reports/${slug}.json`,
    markdownReport:
      `${rootDir}/baselines/${report.promptVersion}__${report.model}__${report.distillerName}.md`.replace(
        /[^a-zA-Z0-9._/-]/g,
        '_',
      ),
  }
}

export type { SampleResult } from './types'
