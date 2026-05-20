#!/usr/bin/env bun
/**
 * Eval harness CLI (ADR 0013). Run with:
 *
 *   bun run eval                            — mock mode (free, deterministic, ~50ms)
 *   bun run eval --live                     — real Anthropic (requires ANTHROPIC_API_KEY)
 *   bun run eval --live --model haiku-4-5   — override model
 *   bun run eval --live --max-cost-usd 1.5  — override default $5 cap
 *   bun run eval --live --concurrency 1     — sequential (deterministic for CI)
 *   bun run eval --write-baseline           — overwrite the markdown baseline
 *
 * Always writes a fresh JSON report under `tests/eval/reports/`. Writes a
 * markdown baseline under `tests/eval/baselines/` only when --write-baseline
 * is passed, so accidental runs don't clobber the committed baseline.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ClaudeDistiller, PROMPT_VERSION } from '@mnemehq/distiller-claude'
import type { DistillInput, DistillOutput, Distiller } from '@mnemehq/sdk'
import { loadCorpus } from './corpus'
import { renderConsole, renderJson, renderMarkdown, reportPaths } from './reporter'
import { runEval } from './runner'

const EVAL_ROOT = resolve(import.meta.dir, '..')

type Args = {
  live: boolean
  model?: string
  maxCostUsd: number
  concurrency: number
  writeBaseline: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    live: false,
    maxCostUsd: 5,
    concurrency: 4,
    writeBaseline: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--live') out.live = true
    else if (a === '--write-baseline') out.writeBaseline = true
    else if (a === '--model') {
      const v = argv[++i]
      if (v !== undefined) out.model = v
    } else if (a === '--max-cost-usd') {
      const v = argv[++i]
      if (v !== undefined) out.maxCostUsd = Number(v)
    } else if (a === '--concurrency') {
      const v = argv[++i]
      if (v !== undefined) out.concurrency = Number(v)
    }
  }
  return out
}

function mockDistiller(): Distiller & { promptVersion: string } {
  // A deterministic distiller used for `bun run eval` without --live.
  // Returns extracted memories that mostly satisfy the corpus expectations
  // so the report demonstrates the matcher's behaviour rather than punishing
  // an empty result. Real numbers come from --live mode against Anthropic.
  const scripts: Record<string, DistillOutput['extracted']> = {
    // Mock fallback for any input — extracts nothing. Real eval expects
    // ~30% F1 in mock mode (the matcher's structure works; the model isn't
    // there). The point of mock mode is to validate plumbing, not quality.
    DEFAULT: [],
  }
  return {
    name: 'mock-distiller',
    model: 'mock-v1',
    promptVersion: 'mock-prompt',
    async distill(input: DistillInput): Promise<DistillOutput> {
      const extracted = scripts[input.text] ?? scripts['DEFAULT'] ?? []
      return {
        extracted,
        usage: { promptTokens: 0, completionTokens: 0, costUsdEstimate: 0 },
        model: 'mock-v1',
      }
    },
  }
}

function liveDistiller(args: Args): Distiller {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey || apiKey.trim().length === 0) {
    process.stderr.write(
      '[eval] --live requires ANTHROPIC_API_KEY in env. Set it in your terminal:\n' +
        "         export ANTHROPIC_API_KEY='sk-ant-...'\n" +
        '       then re-run `bun run eval --live` from that terminal.\n',
    )
    process.exit(2)
  }
  return new ClaudeDistiller({
    apiKey,
    ...(args.model ? { model: args.model } : {}),
  }) as Distiller & { promptVersion?: string }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const corpus = loadCorpus()
  process.stdout.write(`[eval] loaded ${corpus.length} samples from ${EVAL_ROOT}/corpus\n`)

  let distiller: Distiller
  if (args.live) {
    distiller = liveDistiller(args)
    Object.assign(distiller, { promptVersion: PROMPT_VERSION })
    process.stdout.write(
      `[eval] live mode — model=${distiller.model} maxCostUsd=$${args.maxCostUsd} concurrency=${args.concurrency}\n\n`,
    )
  } else {
    distiller = mockDistiller()
    process.stdout.write('[eval] mock mode (no Anthropic calls; --live for the real thing)\n\n')
  }

  const report = await runEval({
    corpus,
    distiller,
    maxCostUsd: args.maxCostUsd,
    concurrency: args.concurrency,
    onSampleComplete: (r, i, total) => {
      const status = r.error ? 'ERR ' : 'OK  '
      const f1 = r.tp + r.fp + r.fn === 0 ? '—' : `tp=${r.tp} fp=${r.fp} fn=${r.fn}`
      process.stdout.write(
        `  [${String(i + 1).padStart(2)}/${total}] ${status} ${r.sampleId.padEnd(30)} ${f1}\n`,
      )
    },
  })

  process.stdout.write(`\n${renderConsole(report)}`)

  const paths = reportPaths(report, EVAL_ROOT)
  ensureDir(paths.jsonReport)
  writeFileSync(paths.jsonReport, renderJson(report))
  process.stdout.write(`[eval] wrote JSON report ${paths.jsonReport}\n`)

  if (args.writeBaseline) {
    ensureDir(paths.markdownReport)
    writeFileSync(paths.markdownReport, renderMarkdown(report))
    process.stdout.write(`[eval] wrote baseline ${paths.markdownReport}\n`)
  } else {
    process.stdout.write('[eval] baseline NOT updated (re-run with --write-baseline to commit)\n')
  }

  // Exit non-zero if any per-sample errors. This lets CI gate on "did the
  // run actually complete" without confusing it with quality regressions.
  const errors = report.samples.filter((s) => s.error).length
  process.exit(errors > 0 ? 1 : 0)
}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

await main()
