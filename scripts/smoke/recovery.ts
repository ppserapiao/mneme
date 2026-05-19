#!/usr/bin/env bun
/**
 * Opens the same store via the BIP-39 recovery phrase (not the passphrase).
 * Disaster-recovery scenario: passphrase forgotten, recovery phrase used to
 * regain access. Asserts records visible + recall still works.
 */
import { LocalEmbedder } from '@mnemehq/embedder-local'
import { Mneme } from '@mnemehq/sdk'

const storePath = process.env.MNEME_SMOKE_STORE_PATH
const recoveryPhrase = process.env.MNEME_SMOKE_RECOVERY_PHRASE
if (!storePath || !recoveryPhrase) {
  process.stderr.write('MNEME_SMOKE_STORE_PATH / MNEME_SMOKE_RECOVERY_PHRASE not set\n')
  process.exit(2)
}

let unlocked = false
let recordsVisible = 0
let recallStillWorks = false

try {
  const mneme = await Mneme.open({
    recoveryPhrase,
    path: storePath,
    ownerId: 'pedro',
    embedder: new LocalEmbedder(),
  })
  unlocked = true

  for await (const record of mneme.exportAll()) {
    if (!record.lifecycle?.forgottenAt) recordsVisible++
  }

  const matches = await mneme.recall('coffee preferences')
  recallStillWorks = matches.length > 0

  mneme.close()
} catch (err) {
  process.stderr.write(
    `recovery open failed: ${err instanceof Error ? err.message : String(err)}\n`,
  )
}

process.stdout.write(`${JSON.stringify({ unlocked, recordsVisible, recallStillWorks })}\n`)
