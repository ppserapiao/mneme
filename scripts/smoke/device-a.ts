#!/usr/bin/env bun
/**
 * Alice's side of the cross-process pairing + sync smoke test.
 *
 * 1. Initialize an encrypted store with 3 alice-side memories.
 * 2. Start the WebSocket pairing server. Emit { event: "pair-url" } when ready.
 *    On SAS, emit { event: "pair-sas", sas } and auto-accept (we're a smoke
 *    test, not a UI; SAS-match is verified by the orchestrator comparing both
 *    sides' emitted SAS values).
 * 3. After pairing completes, start the WebSocketSyncServer.
 * 4. Wait for bob to sync, then emit { event: "summary", count } and exit.
 *
 * Communicates with the orchestrator over stdout (one JSON event per line).
 */
import { Mneme } from '@mnemehq/sdk'
import { WebSocketSyncServer, serveForPairing } from '@mnemehq/sync-websocket'

const pairingPort = Number(process.env.MNEME_SMOKE_PAIRING_PORT)
const syncPort = Number(process.env.MNEME_SMOKE_SYNC_PORT)
if (!pairingPort || !syncPort) {
  process.stderr.write('alice: missing PAIRING_PORT / SYNC_PORT\n')
  process.exit(2)
}

const emit = (event: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}

const storePath = `${process.cwd()}/alice-sync.sqlite`
const { mneme: alice } = await Mneme.initialize({
  passphrase: 'alice-passphrase',
  path: storePath,
  ownerId: 'shared-owner',
})

for (const body of [
  'Alice memory 1: prefers tabs over spaces',
  'Alice memory 2: bug fixed by Sarah on Friday',
  'Alice memory 3: weekly review every Monday 10am',
]) {
  await alice.remember({ kind: 'fact', body })
}

let pairingResolved = false
const pairingDone = serveForPairing(alice, {
  port: pairingPort,
  onUrlReady: (url) => emit({ event: 'pair-url', url }),
  onSasReady: async (sas) => {
    emit({ event: 'pair-sas', sas })
    return true
  },
})

pairingDone
  .then(() => {
    pairingResolved = true
    const syncServer = new WebSocketSyncServer({
      mneme: alice,
      port: syncPort,
      allowedOwnerId: 'shared-owner',
    })
    syncServer.start()
    emit({ event: 'sync-server-ready', port: syncPort })
  })
  .catch((err) => {
    emit({ event: 'pair-error', message: err instanceof Error ? err.message : String(err) })
  })

// Poll until bob's writes show up locally (post-sync), then emit summary.
const deadline = Date.now() + 20_000
let lastCount = 0
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500))
  if (!pairingResolved) continue
  let count = 0
  for await (const record of alice.exportAll()) {
    if (!record.lifecycle?.forgottenAt) count++
  }
  if (count === lastCount && count >= 5) break // settled with bob's contributions present
  lastCount = count
}

emit({ event: 'summary', count: lastCount })
alice.close()
process.exit(0)
