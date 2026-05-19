# @mneme/sync-websocket

WebSocket transport for **mneme** sync and pairing. Two laptops on a LAN — pair and sync with no hosted infrastructure.

> Status: `v0.0.1`. Built on `Bun.serve` for the server, standard `WebSocket` for the client. Pairs with [`@mneme/sdk`](../sdk) v0.0.7+.

## Install

```sh
bun add @mneme/sdk @mneme/sync-websocket
```

Server runtime is **Bun-only** (uses `Bun.serve`). Clients work on any runtime that exposes the standard `WebSocket` class (Bun, Node 22+, browsers).

## Sync between two devices

```ts
// === DEVICE A ===
import { Mneme } from '@mneme/sdk'
import { WebSocketSyncServer } from '@mneme/sync-websocket'

const alice = new Mneme({ path: '/path/to/alice.sqlite', ownerId: 'pedro' })
const server = new WebSocketSyncServer({
  mneme: alice,
  port: 7077,
  allowedOwnerId: 'pedro', // optional: pin to a single owner
})
server.start()
console.log(`Sync target: ${server.url}`) // ws://localhost:7077
```

```ts
// === DEVICE B ===
import { Mneme } from '@mneme/sdk'
import { WebSocketSyncPeer } from '@mneme/sync-websocket'

const bob = new Mneme({ path: '/path/to/bob.sqlite', ownerId: 'pedro' })
const peer = new WebSocketSyncPeer({ url: 'ws://192.168.1.10:7077' })

await bob.sync(peer) // bidirectional convergence
```

The `WebSocketSyncPeer` is a drop-in `SyncPeer`. Everything `mneme.sync(peer)` does in-process now works over the wire, including:

- One-way push / pull
- Bidirectional convergence
- Idempotent re-sync (second call → `{ pushed: 0, pulled: 0, merged: 0 }`)
- Per-field lifecycle merge (concurrent supersede, earliest-wins expiry)

## Pairing between two devices

For **encrypted** sync, both devices need the same master key. Pairing transfers it from a paired device A to a fresh device B over a verified channel.

```ts
// === DEVICE A (paired Mneme — encrypted store) ===
import { serveForPairing } from '@mneme/sync-websocket'

const result = await serveForPairing(alice, {
  port: 7078,
  onUrlReady: (url) => console.log(`Pair to: ${url}`),
  onSasReady: async (sas) => {
    console.log(`Verify SAS on device B matches: ${sas}`)
    return await userConfirms() // your UI returns a boolean
  },
})
// result: { paired: true } or { paired: false, reason }
```

```ts
// === DEVICE B (fresh — no keyring yet) ===
import { pairOverWebSocket } from '@mneme/sync-websocket'

const { mneme: bob, recoveryPhrase } = await pairOverWebSocket({
  url: 'ws://192.168.1.10:7078',
  path: '/path/to/bob.sqlite',
  ownerId: 'pedro',
  passphrase: 'bob-passphrase',
  onSasReady: async (sas) => {
    console.log(`Verify SAS on device A matches: ${sas}`)
    return await userConfirms()
  },
})

console.log('SAVE THIS:', recoveryPhrase) // B's OWN 24-word phrase
console.log(bob.publicKey === alice.publicKey) // true — same master key
```

Both sides drive their own SAS verification via the `onSasReady` callback. If either side returns `false`, the ceremony aborts cleanly (server returns `{ paired: false }`, client throws `unauthorized`). After successful pairing, the standard `bob.sync(new WebSocketSyncPeer({ url }))` works against device A.

## ⚠️ No authentication in v0.0.8

The server accepts any WebSocket connection. **Use only on loopback (`127.0.0.1`) or a network you control.** A bearer-token + TLS auth model lands with hosted Mneme Cloud (v0.1.0).

The crypto story still holds end-to-end:

- Sync exchanges signed encrypted records. Tampering is caught at the consumer's next `get` / `recall` via signature verification.
- Pairing's SAS gives MITM protection independently of channel auth — verify the 6 digits on both screens, ideally over a side channel you trust (in person, voice call, signed Signal message).

See [ADR 0010](../../decisions/0010-websocket-transport.md) for the full design and security rationale.

## Wire protocol

JSON envelopes over WebSocket. Every request carries an `id`; responses echo it. Inspectable with `wscat` or any WebSocket client. The full type definition is exported as `WsRequest` / `WsResponse` from this package.

## License

Apache-2.0.
