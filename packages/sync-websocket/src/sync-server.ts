import { type Mneme, MnemeError, type OwnerId, type SyncPeer } from '@mneme/sdk'
import type { Server, ServerWebSocket } from 'bun'
import type { WsRequest, WsResponse } from './protocol'

type SyncWsData = Record<string, never>

export type WebSocketSyncServerOptions = {
  /** Mneme instance to expose. The server uses `mneme.asPeer()` internally. */
  mneme: Mneme
  /** Port to listen on. Defaults to `0` (OS picks; see `url` for the actual port). */
  port?: number
  /**
   * Restrict requests to a single `ownerId`. Defaults to undefined
   * (any ownerId allowed). Production deployments SHOULD pin this.
   */
  allowedOwnerId?: string
}

/**
 * WebSocket sync server. Wraps a local `Mneme` so a remote `WebSocketSyncPeer`
 * can call its sync verbs (catalog / fetch / push) over the network.
 *
 * Bun-only runtime (uses `Bun.serve`). Clients can connect from any
 * runtime that exposes the standard `WebSocket` class.
 *
 * ⚠️  v0.0.8 ships with NO authentication. The server accepts any incoming
 * connection. Use only on loopback (`127.0.0.1`) or a network you control.
 * See ADR 0010 §"Authentication" for the v0.1.0 plan.
 */
export class WebSocketSyncServer {
  private server: Server<SyncWsData> | undefined
  private readonly peer: SyncPeer
  private readonly allowedOwnerId: string | undefined

  constructor(private readonly options: WebSocketSyncServerOptions) {
    this.peer = options.mneme.asPeer()
    this.allowedOwnerId = options.allowedOwnerId
  }

  /** Start listening. Resolves once the socket is bound. */
  start(): void {
    if (this.server) return
    const peer = this.peer
    const allowedOwnerId = this.allowedOwnerId
    this.server = Bun.serve({
      port: this.options.port ?? 0,
      fetch(req, srv): Response | undefined {
        if (srv.upgrade(req, { data: {} })) return undefined
        return new Response('mneme sync-websocket: WebSocket only', { status: 426 })
      },
      websocket: {
        async message(ws: ServerWebSocket<unknown>, raw: string | Buffer) {
          const data = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
          let request: WsRequest
          try {
            request = JSON.parse(data) as WsRequest
          } catch (err) {
            sendError(ws, undefined, 'invalid_record', `invalid JSON: ${describe(err)}`)
            return
          }
          try {
            assertOwnerAllowed(request, allowedOwnerId)
            const response = await dispatchSync(request, peer)
            ws.send(JSON.stringify(response))
          } catch (err) {
            const code = MnemeError.is(err) ? err.code : 'storage_failure'
            sendError(ws, request.id, code, err instanceof Error ? err.message : String(err))
          }
        },
      },
    })
  }

  /** URL the server is bound to, in `ws://host:port` form. */
  get url(): string {
    if (!this.server) {
      throw new MnemeError('storage_failure', 'WebSocketSyncServer not started')
    }
    const port = this.server.port
    const host = this.server.hostname === '::' ? 'localhost' : this.server.hostname
    return `ws://${host}:${port}`
  }

  /** Stop accepting new connections; existing ones are closed. */
  stop(): void {
    this.server?.stop(true)
    this.server = undefined
  }
}

function assertOwnerAllowed(req: WsRequest, allowed: string | undefined): void {
  if (allowed === undefined) return
  if (req.kind === 'pair:start' || req.kind === 'pair:respond' || req.kind === 'pair:commit') {
    return
  }
  if (req.ownerId !== allowed) {
    throw new MnemeError('unauthorized', `ownerId ${req.ownerId} not permitted on this server`)
  }
}

async function dispatchSync(req: WsRequest, peer: SyncPeer): Promise<WsResponse> {
  switch (req.kind) {
    case 'sync:catalog': {
      const result = await peer.catalog(req.ownerId as OwnerId)
      return { kind: 'sync:catalog:ok', id: req.id, entries: result.entries }
    }
    case 'sync:fetch': {
      const records = await peer.fetch(req.ownerId as OwnerId, req.ids as never)
      return { kind: 'sync:fetch:ok', id: req.id, records }
    }
    case 'sync:push': {
      await peer.push(req.ownerId as OwnerId, req.records)
      return { kind: 'sync:push:ok', id: req.id }
    }
    default: {
      throw new MnemeError('invalid_record', `unexpected request kind on sync server: ${req.kind}`)
    }
  }
}

function sendError(
  ws: ServerWebSocket<unknown>,
  id: string | undefined,
  code: string,
  message: string,
): void {
  const payload: WsResponse =
    id !== undefined
      ? { kind: 'error', id, code: code as never, message }
      : { kind: 'error', code: code as never, message }
  ws.send(JSON.stringify(payload))
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
