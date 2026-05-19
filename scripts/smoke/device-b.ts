#!/usr/bin/env bun
import { WebSocketSyncPeer, pairOverWebSocket } from '@mnemehq/sync-websocket'

const pairingUrl = process.env.MNEME_SMOKE_PAIRING_URL
const syncUrl = process.env.MNEME_SMOKE_SYNC_URL
if (!pairingUrl || !syncUrl) {
  process.stderr.write('bob: missing PAIRING_URL / SYNC_URL\n')
  process.exit(2)
}

const emit = (event: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}

const storePath = `${process.cwd()}/bob-sync.sqlite`

const { mneme: bob } = await pairOverWebSocket({
  url: pairingUrl,
  passphrase: 'bob-passphrase',
  path: storePath,
  ownerId: 'shared-owner',
  onSasReady: async (sas) => {
    emit({ event: 'pair-sas', sas })
    return true
  },
})
emit({ event: 'paired', paired: true })

for (const body of [
  'Bob memory 1: code review checklist v2',
  'Bob memory 2: deploy on Tuesday afternoons only',
]) {
  await bob.remember({ kind: 'fact', body })
}

// Give alice a beat to bring up the sync server (she emits sync-server-ready
// after her pairing promise resolves; in practice the sync-server start is
// fast but we don't want to race it).
await new Promise((r) => setTimeout(r, 500))

const peer = new WebSocketSyncPeer({ url: syncUrl })
await bob.sync(peer)

let count = 0
for await (const record of bob.exportAll()) {
  if (!record.lifecycle?.forgottenAt) count++
}

emit({ event: 'summary', count })
bob.close()
process.exit(0)
