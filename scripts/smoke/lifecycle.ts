#!/usr/bin/env bun
/**
 * Runs inside the smoke-test workdir. Drives the full SDK lifecycle against
 * the npm-installed @mnemehq/sdk (NOT the workspace source). Emits a single
 * JSON summary line on stdout for the orchestrator to parse.
 */
import { LocalEmbedder } from '@mnemehq/embedder-local'
import { Mneme } from '@mnemehq/sdk'

const storePath = `${process.cwd()}/alice.sqlite`

const { mneme, recoveryPhrase } = await Mneme.initialize({
  passphrase: 'correct horse battery staple — smoke',
  path: storePath,
  ownerId: 'pedro',
  embedder: new LocalEmbedder(),
})

const remembered: string[] = []
for (const body of [
  'Prefers single-origin coffee over blends',
  'Lives in London, prefers cycling to driving',
  'Reads sci-fi: Ted Chiang and Cixin Liu, not Asimov',
  'Visited the espresso bar on Brick Lane on Thursday',
  'Marketing partner Sarah replies fastest on Slack DMs',
]) {
  const record = await mneme.remember({ kind: 'preference', body })
  remembered.push(record.id)
}

const matches = await mneme.recall('coffee preferences')
const topPayload = matches[0]?.record.body
const recallTopBody =
  topPayload && 'mode' in topPayload && topPayload.mode === 'plaintext' ? topPayload.data : ''

const firstId = remembered[0] ?? ''
const secondId = remembered[1] ?? ''
if (!firstId || !secondId) throw new Error('missing remembered ids')

await mneme.forget(firstId)

const supersededRecord = await mneme.supersede(secondId, {
  kind: 'preference',
  body: 'Lives in London, prefers walking everywhere',
})

const exported: unknown[] = []
for await (const record of mneme.exportAll()) {
  // exportAll yields ALL records (including forgotten); we count only non-forgotten
  // to match the orchestrator's "expected ≥ 4" assertion (5 written − 1 forgotten).
  if (!record.lifecycle?.forgottenAt) exported.push(record)
}

mneme.close()

process.stdout.write(
  `${JSON.stringify({
    recoveryPhrase,
    storePath,
    rememberedCount: remembered.length,
    recallTopBody,
    forgotten: 1,
    superseded: supersededRecord ? 1 : 0,
    exportedCount: exported.length,
  })}\n`,
)
