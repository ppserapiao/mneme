#!/usr/bin/env bun
/**
 * Smoke scenario 7: Mneme.distill() end-to-end.
 *
 * Verifies that the published @mnemehq/sdk + @mnemehq/distiller-claude wire
 * together correctly:
 *   - SDK exports the Distiller interface
 *   - ClaudeDistiller satisfies the interface and can be passed in
 *   - distill() fans extracted memories out to remember()
 *   - The encrypted store actually persisted them (verified via exportAll;
 *     recall is not used here because this scenario runs without an embedder
 *     and the SDK correctly refuses lexical FTS5 search over ciphertext —
 *     recall quality is the eval harness's job, not the smoke's)
 *
 * Modes:
 *   - DEFAULT (no env): uses a deterministic mock distiller. Runs in CI, never
 *     calls a real LLM, fast (~50ms). Validates the wire between SDK and a
 *     distiller adapter — the API surface, not extraction quality.
 *   - WITH `ANTHROPIC_API_KEY` set: instantiates a real ClaudeDistiller and
 *     calls Anthropic. Validates the actual provider integration. Skipped
 *     automatically when the env is absent.
 */
import { Mneme } from '@mnemehq/sdk'
import type { DistillInput, DistillOutput, Distiller, ExtractedMemory } from '@mnemehq/sdk'

const storePath = `${process.cwd()}/distill.sqlite`

const SAMPLE_TEXT = `
Had a great espresso at the new place on Brick Lane. Reminded me I really
prefer single-origin to blends. Also — Sarah from marketing is replying super
fast on Slack DMs, much faster than email. Should make that the default
channel for her.
`.trim()

function mockDistiller(): Distiller {
  const extracted: ExtractedMemory[] = [
    {
      kind: 'event',
      body: 'Visited the new espresso bar on Brick Lane',
      confidence: 0.9,
      sourceContext: 'Had a great espresso at the new place on Brick Lane',
    },
    {
      kind: 'preference',
      body: 'Prefers single-origin coffee over blends',
      confidence: 0.95,
      sourceContext: 'I really prefer single-origin to blends',
    },
    {
      kind: 'relationship',
      body: 'Sarah works in marketing',
      confidence: 0.95,
      sourceContext: 'Sarah from marketing',
    },
    {
      kind: 'preference',
      body: 'Prefers Slack DMs over email for reaching Sarah in marketing',
      confidence: 0.85,
      sourceContext: 'replying super fast on Slack DMs, much faster than email',
    },
  ]
  return {
    name: 'mock-distiller',
    model: 'mock-v1',
    async distill(_input: DistillInput): Promise<DistillOutput> {
      return {
        extracted,
        usage: { promptTokens: 0, completionTokens: 0, costUsdEstimate: 0 },
        model: 'mock-v1',
      }
    },
  }
}

async function buildDistiller(): Promise<{ distiller: Distiller; mode: 'mock' | 'live' }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key.trim().length === 0) {
    return { distiller: mockDistiller(), mode: 'mock' }
  }
  const { ClaudeDistiller } = await import('@mnemehq/distiller-claude')
  return {
    distiller: new ClaudeDistiller({ apiKey: key }),
    mode: 'live',
  }
}

const { distiller, mode } = await buildDistiller()

const { mneme } = await Mneme.initialize({
  passphrase: 'distill-smoke-passphrase',
  path: storePath,
  ownerId: 'pedro',
  distiller,
})

const result = await mneme.distill(SAMPLE_TEXT, { sourceApp: 'smoke-test', minConfidence: 0.5 })

// Confirm the extracted memories were actually persisted by iterating the
// encrypted store. We deliberately use exportAll() (not recall()) for the
// round-trip check because this scenario runs without an embedder — and the
// SDK correctly refuses lexical FTS5 search over ciphertext. Recall quality
// is the job of the eval harness (ADR 0013), not this smoke; here we just
// want to prove that what distill() wrote, the store remembers.
let persistedCount = 0
let recallTopBody = ''
for await (const record of mneme.exportAll()) {
  if (record.lifecycle?.forgottenAt) continue
  persistedCount++
  if (!recallTopBody && record.body && 'mode' in record.body && record.body.mode === 'plaintext') {
    recallTopBody = record.body.data
  }
}

mneme.close()

process.stdout.write(
  `${JSON.stringify({
    mode,
    distillerName: distiller.name,
    writtenCount: result.written.length,
    persistedCount,
    skipped: result.skipped,
    costUsdEstimate: result.usage.costUsdEstimate,
    recallTopBody,
  })}\n`,
)
