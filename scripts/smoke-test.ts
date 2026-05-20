#!/usr/bin/env bun
/**
 * mneme end-to-end smoke test. Verifies the PUBLISHED @mnemehq/* packages
 * actually work as a system — the gap between "unit tests pass" and "consumers
 * have a working install."
 *
 * What it covers (six scenarios, single run):
 *   1. Fresh `bun add @mnemehq/...` from npm in an isolated /tmp project
 *   2. Full SDK lifecycle (initialize → remember → recall → forget → supersede → export)
 *   3. Encryption at rest: raw bun:sqlite read finds zero plaintext leaks
 *   4. BIP-39 recovery phrase unlocks the same store
 *   5. WebSocket pairing across two separate bun subprocesses (the killer demo)
 *   6. WebSocket sync converges memories from both devices
 *
 * Usage:  bun run smoke           — runs against the latest published versions
 *         bun run smoke --keep    — preserves the /tmp working dir for inspection
 *
 * The test installs from npm, not the workspace. If the published artefact is
 * broken, this catches it before a developer does.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCENARIO_COUNT = 7
const KEEP_WORKDIR = process.argv.includes('--keep')
const ORIGIN = resolve(import.meta.dir, 'smoke')

const startedAt = performance.now()
const workdir = `/tmp/mneme-smoke-${Date.now()}`
const results: Array<{ name: string; ok: boolean; ms: number; detail?: string }> = []

function rule(): void {
  process.stdout.write(`${'═'.repeat(79)}\n`)
}

function line(): void {
  process.stdout.write(`${'─'.repeat(79)}\n`)
}

async function step<T>(
  index: number,
  name: string,
  fn: () => Promise<T | { ok: false; detail: string }>,
): Promise<T | null> {
  const label = `[${index}/${SCENARIO_COUNT}] ${name}`
  process.stdout.write(`${label}\n`)
  const t = performance.now()
  try {
    const value = await fn()
    const ms = performance.now() - t
    if (typeof value === 'object' && value !== null && 'ok' in value && value.ok === false) {
      results.push({ name, ok: false, ms, detail: value.detail })
      process.stdout.write(`     [FAIL]  ${value.detail}  (${ms.toFixed(0)}ms)\n\n`)
      return null
    }
    results.push({ name, ok: true, ms })
    process.stdout.write(`     [OK]    (${ms.toFixed(0)}ms)\n\n`)
    return value as T
  } catch (err) {
    const ms = performance.now() - t
    const detail = err instanceof Error ? err.message : String(err)
    results.push({ name, ok: false, ms, detail })
    process.stdout.write(`     [FAIL]  ${detail}  (${ms.toFixed(0)}ms)\n\n`)
    return null
  }
}

async function runBun(
  args: string[],
  options: { cwd: string; env?: Record<string, string> } = { cwd: workdir },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

function parseLastJsonLine(stdout: string): unknown {
  const lines = stdout.split('\n').filter((l) => l.trim().startsWith('{'))
  if (lines.length === 0) throw new Error(`no JSON line found in stdout:\n${stdout}`)
  const last = lines[lines.length - 1]
  if (!last) throw new Error('no JSON line found in stdout')
  return JSON.parse(last)
}

// ─── header ───────────────────────────────────────────────────────────────
rule()
process.stdout.write('mneme smoke test — verifies the published @mnemehq/* packages end-to-end\n')
rule()
process.stdout.write(`workdir:   ${workdir}\n`)
process.stdout.write(`origin:    ${ORIGIN}\n\n`)

// ─── setup the isolated project ───────────────────────────────────────────
mkdirSync(workdir, { recursive: true })

// 1. Fresh install ----------------------------------------------------------
await step(
  1,
  'fresh install from npm — @mnemehq/sdk + sync-websocket + embedder-local',
  async () => {
    writeFileSync(
      `${workdir}/package.json`,
      JSON.stringify(
        {
          name: 'mneme-smoke',
          version: '0.0.0',
          private: true,
          type: 'module',
        },
        null,
        2,
      ),
    )
    const { exitCode, stderr } = await runBun(
      ['add', '@mnemehq/sdk', '@mnemehq/sync-websocket', '@mnemehq/embedder-local'],
      { cwd: workdir },
    )
    if (exitCode !== 0) return { ok: false, detail: `bun add exited ${exitCode}\n${stderr}` }
    if (!existsSync(`${workdir}/node_modules/@mnemehq/sdk/dist/index.js`)) {
      return { ok: false, detail: '@mnemehq/sdk/dist/index.js missing after install' }
    }
    if (!existsSync(`${workdir}/node_modules/@mnemehq/sync-websocket/dist/index.js`)) {
      return { ok: false, detail: '@mnemehq/sync-websocket/dist/index.js missing after install' }
    }
    return { installed: true }
  },
)

// Copy scenario scripts into the workdir so they can `import '@mnemehq/...'`
// against the locally-installed npm packages, not the source workspace.
for (const file of [
  'lifecycle.ts',
  'encryption-check.ts',
  'recovery.ts',
  'device-a.ts',
  'device-b.ts',
  'distill.ts',
]) {
  const src = `${ORIGIN}/${file}`
  if (!existsSync(src)) {
    process.stdout.write(`[smoke] missing helper script ${src}\n`)
    process.exit(2)
  }
  writeFileSync(`${workdir}/${file}`, readFileSync(src, 'utf8'))
}

// 2. SDK lifecycle ----------------------------------------------------------
const lifecycle = await step<{
  recoveryPhrase: string
  storePath: string
  rememberedCount: number
  recallTopBody: string
  forgotten: number
  superseded: number
  exportedCount: number
}>(2, 'sdk lifecycle (initialize → remember → recall → forget → supersede → export)', async () => {
  const { stdout, stderr, exitCode } = await runBun(['run', 'lifecycle.ts'], { cwd: workdir })
  if (exitCode !== 0) return { ok: false, detail: `lifecycle.ts exited ${exitCode}\n${stderr}` }
  const result = parseLastJsonLine(stdout) as {
    recoveryPhrase: string
    storePath: string
    rememberedCount: number
    recallTopBody: string
    forgotten: number
    superseded: number
    exportedCount: number
  }
  if (result.rememberedCount !== 5) {
    return { ok: false, detail: `expected 5 memories, got ${result.rememberedCount}` }
  }
  if (!result.recallTopBody.toLowerCase().includes('coffee')) {
    return {
      ok: false,
      detail: `recall("coffee") top match was "${result.recallTopBody}" — does not mention coffee`,
    }
  }
  if (result.forgotten !== 1)
    return { ok: false, detail: `expected 1 forgotten, got ${result.forgotten}` }
  if (result.superseded !== 1)
    return { ok: false, detail: `expected 1 superseded, got ${result.superseded}` }
  if (result.exportedCount < 4) {
    return { ok: false, detail: `expected ≥ 4 exported, got ${result.exportedCount}` }
  }
  if (result.recoveryPhrase.split(' ').length !== 24) {
    return {
      ok: false,
      detail: `recovery phrase had ${result.recoveryPhrase.split(' ').length} words, expected 24`,
    }
  }
  return result
})

// 3. Encryption at rest -----------------------------------------------------
if (lifecycle) {
  await step(3, 'encryption at rest — raw bun:sqlite read finds zero plaintext leaks', async () => {
    const { stdout, stderr, exitCode } = await runBun(['run', 'encryption-check.ts'], {
      cwd: workdir,
      env: { MNEME_SMOKE_STORE_PATH: lifecycle.storePath },
    })
    if (exitCode !== 0) {
      return { ok: false, detail: `encryption-check.ts exited ${exitCode}\n${stderr}` }
    }
    const result = parseLastJsonLine(stdout) as {
      rowCount: number
      plaintextLeaks: string[]
    }
    if (result.rowCount === 0)
      return { ok: false, detail: 'sqlite has zero rows — no encryption to verify' }
    if (result.plaintextLeaks.length > 0) {
      return {
        ok: false,
        detail: `plaintext leaks found: ${result.plaintextLeaks.slice(0, 3).join('; ')}`,
      }
    }
    return result
  })

  // 4. Recovery phrase ------------------------------------------------------
  await step(4, 'bip-39 recovery phrase unlocks the same store from a fresh handle', async () => {
    const { stdout, stderr, exitCode } = await runBun(['run', 'recovery.ts'], {
      cwd: workdir,
      env: {
        MNEME_SMOKE_STORE_PATH: lifecycle.storePath,
        MNEME_SMOKE_RECOVERY_PHRASE: lifecycle.recoveryPhrase,
      },
    })
    if (exitCode !== 0) return { ok: false, detail: `recovery.ts exited ${exitCode}\n${stderr}` }
    const result = parseLastJsonLine(stdout) as {
      unlocked: boolean
      recordsVisible: number
      recallStillWorks: boolean
    }
    if (!result.unlocked) return { ok: false, detail: 'Mneme.open with recovery phrase failed' }
    if (result.recordsVisible < 4) {
      return {
        ok: false,
        detail: `expected ≥ 4 records after recovery unlock, got ${result.recordsVisible}`,
      }
    }
    if (!result.recallStillWorks)
      return { ok: false, detail: 'recall returned no matches after recovery unlock' }
    return result
  })
}

// 5 + 6. Pairing + sync across two separate bun subprocesses ---------------
let aliceProc: ReturnType<typeof Bun.spawn> | null = null
let bobProc: ReturnType<typeof Bun.spawn> | null = null

// Both subprocesses publish JSON events one-per-line on stdout. We
// continuously stream both into a shared event buffer; the test code below
// waits for specific events to appear.
type StreamedEvent = { source: 'alice' | 'bob'; ev: Record<string, unknown> }
const events: StreamedEvent[] = []
const startReader = (proc: ReturnType<typeof Bun.spawn>, source: 'alice' | 'bob'): void => {
  void (async (): Promise<void> => {
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) return
        buf += decoder.decode(value)
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const raw of lines) {
          const t = raw.trim()
          if (!t.startsWith('{')) continue
          try {
            events.push({ source, ev: JSON.parse(t) })
          } catch {}
        }
      }
    } catch {}
  })()
}
const waitFor = async (
  predicate: (e: StreamedEvent) => boolean,
  timeoutMs: number,
): Promise<StreamedEvent | null> => {
  const deadline = Date.now() + timeoutMs
  let cursor = 0
  while (Date.now() < deadline) {
    while (cursor < events.length) {
      const e = events[cursor++]
      if (e && predicate(e)) return e
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  return null
}

await step(5, 'websocket pairing — two bun subprocesses, sas exchanged + verified', async () => {
  const pairingPort = 17000 + Math.floor(Math.random() * 1000)
  const syncPort = 18000 + Math.floor(Math.random() * 1000)

  aliceProc = Bun.spawn(['bun', 'run', 'device-a.ts'], {
    cwd: workdir,
    env: {
      ...process.env,
      MNEME_SMOKE_PAIRING_PORT: String(pairingPort),
      MNEME_SMOKE_SYNC_PORT: String(syncPort),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  startReader(aliceProc, 'alice')

  // Wait for alice to bind and emit her pair-url. SAS only arrives after bob
  // connects, so we must NOT block on it before spawning bob.
  const urlEvent = await waitFor((e) => e.source === 'alice' && e.ev.event === 'pair-url', 10_000)
  if (!urlEvent) return { ok: false, detail: 'alice never emitted pair-url within 10s' }
  const aliceUrl = String(urlEvent.ev.url)

  bobProc = Bun.spawn(['bun', 'run', 'device-b.ts'], {
    cwd: workdir,
    env: {
      ...process.env,
      MNEME_SMOKE_PAIRING_URL: aliceUrl,
      MNEME_SMOKE_SYNC_URL: `ws://localhost:${syncPort}`,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  startReader(bobProc, 'bob')

  // Now wait for BOTH sides to emit their SAS concurrently.
  const [aliceSasEvent, bobSasEvent] = await Promise.all([
    waitFor((e) => e.source === 'alice' && e.ev.event === 'pair-sas', 15_000),
    waitFor((e) => e.source === 'bob' && e.ev.event === 'pair-sas', 15_000),
  ])
  if (!aliceSasEvent)
    return { ok: false, detail: 'alice never emitted pair-sas (bob may have failed to connect)' }
  if (!bobSasEvent) return { ok: false, detail: 'bob never emitted pair-sas' }
  const aliceSas = String(aliceSasEvent.ev.sas)
  const bobSas = String(bobSasEvent.ev.sas)
  if (aliceSas !== bobSas) {
    return { ok: false, detail: `SAS mismatch: alice=${aliceSas}  bob=${bobSas}` }
  }

  const pairedEvent = await waitFor((e) => e.source === 'bob' && e.ev.event === 'paired', 10_000)
  if (!pairedEvent) return { ok: false, detail: 'bob never reported `paired: true`' }
  return { aliceSas, bobSas, aliceUrl }
})

await step(
  6,
  'websocket sync — alice and bob converge over a real bun-to-bun WebSocket',
  async () => {
    if (!aliceProc || !bobProc) return { ok: false, detail: 'pairing did not run; skipping sync' }

    const [aliceSummary, bobSummary] = await Promise.all([
      waitFor((e) => e.source === 'alice' && e.ev.event === 'summary', 20_000),
      waitFor((e) => e.source === 'bob' && e.ev.event === 'summary', 20_000),
    ])
    if (!aliceSummary) return { ok: false, detail: 'alice never emitted summary within 20s' }
    if (!bobSummary) return { ok: false, detail: 'bob never emitted summary within 20s' }
    const aliceCount = Number(aliceSummary.ev.count)
    const bobCount = Number(bobSummary.ev.count)
    if (aliceCount !== bobCount) {
      return { ok: false, detail: `convergence failed: alice=${aliceCount}, bob=${bobCount}` }
    }
    if (aliceCount < 5) {
      return {
        ok: false,
        detail: `expected ≥ 5 converged records (3 alice + 2 bob), got ${aliceCount}`,
      }
    }
    return { aliceCount, bobCount }
  },
)

// 7. Distiller end-to-end (mock by default; live Claude when ANTHROPIC_API_KEY set).
// `@mnemehq/distiller-claude` is installed lazily — if not yet published to
// npm (this happens transiently on the PR that introduces it), the scenario
// is skipped cleanly with a clear `[SKIP]` marker rather than a failure.
await step(7, 'distiller — extract memories from raw text and persist via remember()', async () => {
  const installResult = await runBun(['add', '@mnemehq/distiller-claude'], { cwd: workdir })
  if (installResult.exitCode !== 0) {
    return {
      ok: false,
      detail:
        '@mnemehq/distiller-claude not installable from npm (probably not yet published). Re-run `bun run smoke` after publish.',
    }
  }
  const mode = process.env.ANTHROPIC_API_KEY ? 'live (Anthropic)' : 'mock'
  const passEnv: Record<string, string> = {}
  if (process.env.ANTHROPIC_API_KEY) passEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  const { stdout, stderr, exitCode } = await runBun(['run', 'distill.ts'], {
    cwd: workdir,
    env: passEnv,
  })
  if (exitCode !== 0) {
    return { ok: false, detail: `distill.ts (${mode}) exited ${exitCode}\n${stderr}` }
  }
  const result = parseLastJsonLine(stdout) as {
    mode: 'mock' | 'live'
    distillerName: string
    writtenCount: number
    skipped: number
    costUsdEstimate: number
    recallTopBody: string
  }
  if (result.writtenCount < 2) {
    return {
      ok: false,
      detail: `distiller wrote ${result.writtenCount} memories, expected ≥ 2`,
    }
  }
  if (!result.recallTopBody) {
    return {
      ok: false,
      detail: 'recall on distilled store returned no plaintext body — round-trip broken',
    }
  }
  return result
})

// ─── teardown ─────────────────────────────────────────────────────────────
for (const p of [aliceProc, bobProc]) {
  if (p && !p.killed) p.kill()
}

// ─── report ────────────────────────────────────────────────────────────────
const totalMs = performance.now() - startedAt
const passed = results.filter((r) => r.ok).length

rule()
process.stdout.write('summary\n')
line()
for (const r of results) {
  const mark = r.ok ? '[OK]  ' : '[FAIL]'
  process.stdout.write(`${mark}  ${r.name.padEnd(60)} ${r.ms.toFixed(0)}ms\n`)
  if (!r.ok && r.detail) process.stdout.write(`        ↳ ${r.detail.split('\n')[0]}\n`)
}
line()
process.stdout.write(
  `RESULT: ${passed}/${SCENARIO_COUNT} passed in ${(totalMs / 1000).toFixed(1)}s\n`,
)
process.stdout.write(
  `workdir: ${workdir}${KEEP_WORKDIR ? '  (preserved with --keep)' : '  (cleaning up)'}\n`,
)
rule()

if (!KEEP_WORKDIR) {
  try {
    rmSync(workdir, { recursive: true, force: true })
  } catch {}
}

process.exit(passed === SCENARIO_COUNT ? 0 : 1)
