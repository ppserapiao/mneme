#!/usr/bin/env bun
/**
 * Eval harness CLI (ADR 0013 + ADR 0014). Run with:
 *
 *   bun run eval                              — mock mode (free, ~50ms)
 *   bun run eval --live                       — real Anthropic distillation, strict scoring only
 *   bun run eval --live --judge=claude        — real Anthropic + LLM-as-judge semantic scoring (ADR 0014)
 *   bun run eval --live --judge-model haiku-4-5  — override the judge model
 *   bun run eval --live --model sonnet-4-7    — override distillation model
 *   bun run eval --live --max-cost-usd 1.5    — override default $5 cap (distillation only; judge tracked separately)
 *   bun run eval --live --concurrency 1       — sequential (deterministic for CI)
 *   bun run eval --write-baseline             — overwrite the markdown baseline
 *
 * Always writes a fresh JSON report under `tests/eval/reports/`. Writes a
 * markdown baseline under `tests/eval/baselines/` only when --write-baseline
 * is passed, so accidental runs don't clobber the committed baseline.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ClaudeDistiller, PROMPT_VERSION } from '@mnemehq/distiller-claude'
import type { DistillInput, DistillOutput, Distiller } from '@mnemehq/sdk'
import { Mem0Distiller, qdrantReachable } from './competitors/mem0'
import { loadCorpus } from './corpus'
import { ClaudeJudgeMatcher } from './judge'
import type { Matcher } from './matcher'
import { renderConsole, renderJson, renderMarkdown, reportPaths } from './reporter'
import { runEval } from './runner'

const EVAL_ROOT = resolve(import.meta.dir, '..')

type Args = {
  live: boolean
  model?: string
  maxCostUsd: number
  concurrency: number
  writeBaseline: boolean
  /** `'claude'` to enable LLM-as-judge mode; undefined disables it (default). */
  judge?: 'claude'
  /** Judge model override. Default: `claude-haiku-4-5` (ADR 0014 §3). */
  judgeModel?: string
  /**
   * Distiller to evaluate. Default: `claude` (mneme's own ClaudeDistiller).
   * `mem0` runs the corpus through Mem0 (ADR 0015 — comparative eval).
   * Future: `letta`, `zep`, `openai-memory`, etc.
   */
  distiller?: 'claude' | 'mem0'
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
    else if (a?.startsWith('--judge=')) {
      const v = a.slice('--judge='.length)
      if (v === 'claude') out.judge = 'claude'
      else {
        process.stderr.write(`[eval] unknown --judge value: ${v} (only 'claude' supported)\n`)
        process.exit(2)
      }
    } else if (a === '--judge') {
      const v = argv[++i]
      if (v === 'claude') out.judge = 'claude'
      else {
        process.stderr.write(`[eval] unknown --judge value: ${v} (only 'claude' supported)\n`)
        process.exit(2)
      }
    } else if (a === '--judge-model') {
      const v = argv[++i]
      if (v !== undefined) out.judgeModel = v
    } else if (a === '--model') {
      const v = argv[++i]
      if (v !== undefined) out.model = v
    } else if (a === '--max-cost-usd') {
      const v = argv[++i]
      if (v !== undefined) out.maxCostUsd = Number(v)
    } else if (a === '--concurrency') {
      const v = argv[++i]
      if (v !== undefined) out.concurrency = Number(v)
    } else if (a?.startsWith('--distiller=')) {
      const v = a.slice('--distiller='.length)
      if (v === 'claude' || v === 'mem0') out.distiller = v
      else {
        process.stderr.write(`[eval] unknown --distiller value: ${v} (supported: claude, mem0)\n`)
        process.exit(2)
      }
    } else if (a === '--distiller') {
      const v = argv[++i]
      if (v === 'claude' || v === 'mem0') out.distiller = v
      else {
        process.stderr.write(`[eval] unknown --distiller value: ${v} (supported: claude, mem0)\n`)
        process.exit(2)
      }
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

async function liveDistiller(args: Args): Promise<Distiller> {
  const which = args.distiller ?? 'claude'
  if (which === 'claude') return liveClaudeDistiller(args)
  if (which === 'mem0') return await liveMem0Distiller(args)
  throw new Error(`unsupported distiller ${which}`)
}

function liveClaudeDistiller(args: Args): Distiller {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey || apiKey.trim().length === 0) {
    process.stderr.write(
      '[eval] --live requires ANTHROPIC_API_KEY in env. Set in your terminal:\n' +
        "         export ANTHROPIC_API_KEY='sk-ant-...'\n",
    )
    process.exit(2)
  }
  const d = new ClaudeDistiller({
    apiKey,
    ...(args.model ? { model: args.model } : {}),
  }) as Distiller & { promptVersion?: string }
  Object.assign(d, { promptVersion: PROMPT_VERSION })
  return d
}

async function liveMem0Distiller(args: Args): Promise<Distiller> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY']
  const openaiApiKey = process.env['OPENAI_API_KEY']
  const qdrantUrl = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
  if (!anthropicApiKey || anthropicApiKey.trim().length === 0) {
    process.stderr.write(
      '[eval] --distiller=mem0 requires ANTHROPIC_API_KEY (Mem0 uses Anthropic as the LLM per ADR 0015).\n',
    )
    process.exit(2)
  }
  if (!openaiApiKey || openaiApiKey.trim().length === 0) {
    process.stderr.write(
      '[eval] --distiller=mem0 requires OPENAI_API_KEY (Mem0 uses OpenAI embeddings per ADR 0015).\n' +
        "       In your terminal: export OPENAI_API_KEY='sk-...'\n" +
        '       Anthropic does not ship an embeddings API; this is a Mem0 constraint, not a mneme one.\n',
    )
    process.exit(2)
  }

  // Preflight: Mem0's Qdrant backend must be reachable before we make any LLM
  // call. Otherwise the first sample burns Anthropic + OpenAI tokens just to
  // hit a connection error on write-back. Fail-fast saves the budget.
  process.stdout.write(`[eval] preflight: probing Qdrant at ${qdrantUrl} ...\n`)
  const ok = await qdrantReachable(qdrantUrl)
  if (!ok) {
    process.stderr.write(
      `[eval] Qdrant is not reachable at ${qdrantUrl}.
       Start it with:
         docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
       Then verify:
         curl -s http://localhost:6333/readyz   # expect: ready
       Or set QDRANT_URL='http://host:port' if you're running it elsewhere.
       (Why Qdrant? Mem0+Bun is incompatible with Mem0's in-memory store; see ADR 0015.)
`,
    )
    process.exit(2)
  }
  process.stdout.write('[eval] preflight: Qdrant ready\n')

  process.stdout.write(
    '[eval] NOTE: Mem0 will make Anthropic + OpenAI calls under your keys.\n' +
      '       Expect ~$0.30 Anthropic + ~$0.05 OpenAI per 100-sample run.\n' +
      '       Monitor your dashboards. Per-call cost is NOT tracked inside Mem0 (v0.2 target, ADR 0015 §5).\n',
  )
  return new Mem0Distiller({
    anthropicApiKey,
    openaiApiKey,
    qdrantUrl,
    ...(args.model ? { llmModel: args.model } : {}),
  })
}

function liveJudge(args: Args): Matcher {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey || apiKey.trim().length === 0) {
    process.stderr.write(
      '[eval] --judge=claude requires ANTHROPIC_API_KEY in env (same key the distiller uses).\n',
    )
    process.exit(2)
  }
  return new ClaudeJudgeMatcher({
    apiKey,
    ...(args.judgeModel ? { model: args.judgeModel } : {}),
  })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const corpus = loadCorpus()
  process.stdout.write(`[eval] loaded ${corpus.length} samples from ${EVAL_ROOT}/corpus\n`)

  let distiller: Distiller
  if (args.live) {
    distiller = await liveDistiller(args) // already sets promptVersion per distiller
    const whichDistiller = args.distiller ?? 'claude'
    process.stdout.write(
      `[eval] live mode — distiller=${whichDistiller} model=${distiller.model} maxCostUsd=$${args.maxCostUsd} concurrency=${args.concurrency}\n`,
    )
  } else {
    distiller = mockDistiller()
    process.stdout.write('[eval] mock mode (no Anthropic calls; --live for the real thing)\n')
  }

  let judge: Matcher | undefined
  if (args.judge === 'claude') {
    if (!args.live) {
      process.stderr.write(
        '[eval] --judge=claude requires --live (the judge calls Anthropic; mock mode is for plumbing only)\n',
      )
      process.exit(2)
    }
    judge = liveJudge(args)
    process.stdout.write(`[eval] judge enabled — ${judge.name}\n`)
  }
  process.stdout.write('\n')

  const report = await runEval({
    corpus,
    distiller,
    ...(judge ? { judge } : {}),
    maxCostUsd: args.maxCostUsd,
    concurrency: args.concurrency,
    onSampleComplete: (r, i, total) => {
      const status = r.error ? 'ERR ' : 'OK  '
      const strict = `strict=${r.strict.tp}/${r.strict.fp}/${r.strict.fn}`
      const semantic = r.semantic
        ? `  semantic=${r.semantic.tp}/${r.semantic.fp}/${r.semantic.fn}`
        : ''
      process.stdout.write(
        `  [${String(i + 1).padStart(2)}/${total}] ${status} ${r.sampleId.padEnd(30)} ${strict}${semantic}\n`,
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
