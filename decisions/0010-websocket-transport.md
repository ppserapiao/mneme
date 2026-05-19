# 0010 — WebSocket transport for sync and pairing

**Status**: Accepted
**Date**: 2026-05-19

## Context

v0.0.6 shipped the sync engine over an abstract `SyncPeer` interface; v0.0.7 shipped the pairing ceremony over abstract `PairingInvite`/`Response`/`TransferBundle` messages. Both were deliberately transport-agnostic — they ship the cryptographic and merge cores while leaving "how do the messages actually move between two machines" to dedicated transport packages.

v0.0.8 ships the first real network transport. It's the difference between "we have a cryptographic demo in one process" and "two laptops on a coffee-shop wifi just paired and synced." The path matters for distribution: without a network transport, the only multi-device demo is in-process, which doesn't tell the local-first sovereignty story.

This ADR locks the transport choices for both sync and pairing:

1. **Runtime** — Bun's built-in `Bun.serve` for the server, the standard `WebSocket` class for the client.
2. **Wire protocol** — JSON envelopes over WebSocket, request/reply correlated by `id`, discriminated union of message types.
3. **Authentication** — none in v0.0.8 (LAN-only, loud README warnings). Bearer-token auth lands when hosted Mneme Cloud (`apps/api`) does.
4. **Pairing UX** — orchestrated via callbacks so the consumer (CLI, web UI, eventual desktop app) drives the SAS verification step at the right moment.

## Decision

### Runtime: Bun.serve + native WebSocket

- **Server**: `Bun.serve({ port, fetch, websocket })`. Built-in, zero external dep, fast. The same primitive will host hosted Mneme Cloud in v0.1.0 (probably behind Hono); for v0.0.8 the bare API is sufficient.
- **Client**: `globalThis.WebSocket` (built into Bun and Node 22+). Falls back to the `ws` package only if Node compatibility for older versions becomes a real ask.
- **Port**: caller-chosen, or `0` (OS picks); server exposes `.url` after start. Random ports keep tests deterministic-free.

### Wire protocol: JSON envelopes with request id

Every message is a JSON object. Requests carry an `id`; responses echo it. Notifications (which don't expect a reply) omit `id`.

```ts
type WsRequest =
  | { kind: 'sync:catalog'; id: string; ownerId: string }
  | { kind: 'sync:fetch'; id: string; ownerId: string; ids: string[] }
  | { kind: 'sync:push'; id: string; ownerId: string; records: MemoryRecord[] }
  | { kind: 'pair:start'; id: string }
  | { kind: 'pair:respond'; id: string; response: PairingResponse }
  | { kind: 'pair:commit'; id: string }

type WsResponse =
  | { kind: 'sync:catalog:ok'; id: string; entries: SyncCatalogEntry[] }
  | { kind: 'sync:fetch:ok'; id: string; records: MemoryRecord[] }
  | { kind: 'sync:push:ok'; id: string }
  | { kind: 'pair:start:ok'; id: string; invite: PairingInvite }
  | { kind: 'pair:respond:ok'; id: string; sas: string }
  | { kind: 'pair:commit:ok'; id: string; bundle: PairingTransferBundle }
  | { kind: 'error'; id?: string; code: MnemeErrorCode; message: string }
```

A single connection can carry both sync and pairing traffic — they're identified by `kind`. In v0.0.8 we use one connection per session (a sync session, or a pairing session); pooling is a future optimisation.

Payload size is bounded by Bun's WebSocket frame defaults (16 MiB). Larger record sets would need chunked transfer; v0.0.8 assumes per-owner catalogs fit easily.

### Authentication: none in v0.0.8

The server accepts any WebSocket connection. This is acceptable for v0.0.8 because:

- The intended deployment is loopback or LAN, where the user trusts the network surface they're exposing.
- Authentication interacts with the user's identity model (passphrase? token? mTLS?). Solving it before hosted Cloud lands risks a model we'd have to redo.
- The pairing ceremony's SAS gives end-to-end MITM protection independently of channel auth — even if an attacker opens a connection to alice's pairing server, the user catches them when the SAS doesn't match.
- The sync engine already exchanges signed records; signature verification happens at the consumer boundary on `get`/`recall` (ADR 0008 §5), so a malicious peer pushing garbage bytes hits an `invalid_record` error before it surfaces.

The package README explicitly says: **"do not expose the WebSocket server to a network you do not control."** Bearer-token auth lands with the Cloud ADR.

### Pairing UX: callback-driven SAS verification

The 3-message pairing handshake needs a human-in-the-loop pause between the second and third messages — the user compares the 6-digit SAS on both screens. The transport orchestrates the three messages and exposes the SAS via a callback so the consumer (CLI prompt, web UI confirm button, eventual desktop app) can drive verification at the right moment.

Device A:

```ts
import { serveForPairing } from '@mneme/sync-websocket'

const result = await serveForPairing(alice, {
  port: 7078,
  onConnected: (url) => console.log(`Pair to ${url}`),
  onSasReady: async (sas) => {
    console.log(`Verify SAS on device B matches: ${sas}`)
    return await userConfirmsMatch() // boolean
  },
})
// result: { paired: true } or { paired: false, reason }
```

Device B:

```ts
import { pairOverWebSocket } from '@mneme/sync-websocket'

const { mneme: bob, recoveryPhrase } = await pairOverWebSocket({
  url: 'ws://192.168.1.10:7078',
  passphrase: 'bob-passphrase',
  path: '/path/to/b.sqlite',
  ownerId: 'pedro',
  onSasReady: async (sas) => {
    console.log(`Verify SAS on device A matches: ${sas}`)
    return await userConfirmsMatch()
  },
})
```

If either side's `onSasReady` returns `false`, the transport aborts (closes the WS, refuses to commit) — guarantees the user can stop the ceremony on either device.

### Errors and disconnect

- Any thrown error in a handler becomes an `error` message with the corresponding `MnemeErrorCode` (closed set from the protocol package).
- WebSocket close without a successful completion of an in-flight request raises `MnemeError({ code: 'storage_failure' })` on the requester.
- Server stop is graceful: existing in-flight requests get a final `error` response before the socket closes.

### Out of scope (tracked)

- **Authentication / authorization** — comes with hosted Cloud (`apps/api`, v0.1.0).
- **TLS termination** — caller's responsibility. README points at `wss://` via a reverse proxy for any non-loopback deployment.
- **Connection pooling** for repeated syncs — v0.0.8 opens a fresh connection per `mneme.sync()` / pairing session. Pooling lands when there's measurable benefit.
- **Chunked payloads** for catalogs / record batches >16 MiB — v0.0.7 sync engine assumes full catalogs fit; revisit when a user hits the limit.
- **Server-sent live updates (OBSERVE verb)** — protocol v0.2 work.
- **WebRTC peer-to-peer** without a signaling server — interesting but future. The ceremony abstraction already supports it.

## Consequences

Positive:

- Two laptops on a coffee-shop wifi can pair (`SAS verified`) and sync (`alice.sync(peer)` over `ws://`) end-to-end with no hosted infrastructure. That demo turns the cryptographic claims into a tangible experience.
- The transport package has zero opinions about the runtime hosting it — it's a small Bun WebSocket server + a `WebSocket` client. Lifting it to a real Cloud transport in v0.1.0 means swapping the dial endpoint and adding auth headers, not rewriting the engine.
- The wire protocol is JSON, inspectable by anyone with `wscat`. No magic binary formats; every message has a `kind` and an `id`. Debugging is straightforward.
- Pairing UX with `onSasReady` callbacks fits both CLI flows (terminal prompt) and UI flows (modal with two buttons) — same code path, different presentation.

Negative:

- **No auth in v0.0.8.** Anyone with network access to the server port can connect. Documented as a hard constraint ("loopback or trusted LAN only"). The brand promise stays intact because nothing decryptable leaves the device — encrypted records remain ciphertext to any non-pairing observer — but server-side resource abuse (catalog dumps) is possible.
- **Bun-only server runtime.** Node consumers can use the client (standard WebSocket) but the server needs Bun. Tracked; non-blocking for the consumer / developer demos.
- **Per-session connections** (no pool) means small overhead for repeated syncs. Negligible at v0.0.8 scale; trivially upgradable.
- **JSON encoding overhead** compared to a binary framing. Tradeoff explicitly chosen for inspectability and debuggability; switching to MessagePack or CBOR is a future micro-optimisation.

## Alternatives considered

- **gRPC / Protobuf.** Strong typing, efficient binary, mature tooling. Rejected for v0.0.8: it forces a code-gen step into the SDK build, complicates the inspectability story, and gives us nothing the JSON envelope doesn't already give us at v0.0.8 scale. We can revisit if we hit a real protocol-evolution pain.
- **HTTP/2 + JSON-RPC** instead of WebSocket. Cleaner semantically for the request/reply pattern, but loses the bidirectional channel pairing actually uses. WebSocket fits both shapes.
- **WebRTC peer-to-peer**. No server required; works through NAT via STUN/TURN. Interesting but adds a heavy signaling/STUN layer. The mneme MCP server / desktop app will likely run a local WS server anyway, and the user already trusts that surface.
- **Standard `ws` library on the server side** (Node-compatible). Considered for portability. Rejected because we're already Bun-first in the SDK (`bun:sqlite`), and Bun.serve has a cleaner API. We can add a `ws`-based server adapter later for Node consumers.
- **Embed the transport into the SDK itself.** Tempting for one-line ergonomics. Rejected because (a) it adds a transport opinion to the otherwise transport-agnostic SDK, (b) it forces SDK consumers to pull in WebSocket code they may not need (e.g. a CLI that only does in-process operations), and (c) we want a clean pattern for future transports (Bonjour/mDNS, BLE, WebRTC) to slot in.
- **Bearer-token auth in v0.0.8.** Considered. The right answer for production is bound to the hosted Cloud's identity model (who issues the tokens? where do they live? how are they rotated?). Doing it now without that context would lock in a model we'd have to redo. The loopback-only constraint is honest about the v0.0.8 boundary.
