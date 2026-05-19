import {
  type MemoryId,
  type MemoryRecord,
  MnemeError,
  type MnemeErrorCode,
  type OwnerId,
  type SyncCatalog,
  type SyncPeer,
} from '@mneme/sdk'
import { type WsRequest, type WsResponse, isErrorResponse, newRequestId } from './protocol'

export type WebSocketSyncPeerOptions = {
  /** WebSocket URL of the peer's sync server (e.g. `ws://192.168.1.10:7077`). */
  url: string
  /** Timeout per request in milliseconds. Defaults to 30 000. */
  requestTimeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

type Pending = {
  resolve: (value: WsResponse) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * `SyncPeer` implementation that talks to a remote `WebSocketSyncServer` over
 * a single WebSocket connection. The connection is opened lazily on the first
 * call and reused for all subsequent calls; close it explicitly via `close()`.
 *
 * v0.0.8 ships without authentication — use only on loopback or a network
 * you control. See ADR 0010 §"Authentication".
 */
export class WebSocketSyncPeer implements SyncPeer {
  private readonly url: string
  private readonly requestTimeoutMs: number
  private socket: WebSocket | undefined
  private opening: Promise<WebSocket> | undefined
  private readonly pending = new Map<string, Pending>()

  constructor(options: WebSocketSyncPeerOptions) {
    this.url = options.url
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async catalog(ownerId: OwnerId): Promise<SyncCatalog> {
    const resp = await this.request<{ entries: SyncCatalog['entries'] }>({
      kind: 'sync:catalog',
      id: newRequestId(),
      ownerId,
    })
    return { entries: resp.entries }
  }

  async fetch(
    ownerId: OwnerId,
    ids: ReadonlyArray<MemoryId>,
  ): Promise<ReadonlyArray<MemoryRecord>> {
    const resp = await this.request<{ records: ReadonlyArray<MemoryRecord> }>({
      kind: 'sync:fetch',
      id: newRequestId(),
      ownerId,
      ids: [...ids],
    })
    return resp.records
  }

  async push(ownerId: OwnerId, records: ReadonlyArray<MemoryRecord>): Promise<void> {
    await this.request({
      kind: 'sync:push',
      id: newRequestId(),
      ownerId,
      records: [...records],
    })
  }

  /** Close the underlying WebSocket. Safe to call multiple times. */
  close(): void {
    const sock = this.socket
    this.socket = undefined
    this.opening = undefined
    if (sock && sock.readyState <= WebSocket.OPEN) sock.close(1000)
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new MnemeError('storage_failure', 'WebSocket peer closed'))
    }
    this.pending.clear()
  }

  private async connect(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return this.socket
    if (this.opening) return this.opening
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.url)
      const onOpen = () => {
        ws.removeEventListener('error', onError)
        this.socket = ws
        this.opening = undefined
        ws.addEventListener('message', (ev: MessageEvent) => {
          this.handleMessage(typeof ev.data === 'string' ? ev.data : '')
        })
        ws.addEventListener('close', () => {
          this.socket = undefined
          for (const [, pending] of this.pending) {
            clearTimeout(pending.timer)
            pending.reject(new MnemeError('storage_failure', 'WebSocket connection closed'))
          }
          this.pending.clear()
        })
        resolve(ws)
      }
      const onError = () => {
        ws.removeEventListener('open', onOpen)
        this.opening = undefined
        reject(new MnemeError('storage_failure', `WebSocket connection failed: ${this.url}`))
      }
      ws.addEventListener('open', onOpen, { once: true })
      ws.addEventListener('error', onError, { once: true })
    })
    return this.opening
  }

  private handleMessage(data: string): void {
    let parsed: WsResponse
    try {
      parsed = JSON.parse(data) as WsResponse
    } catch {
      return
    }
    const id = parsed.id
    if (id === undefined) return
    const handler = this.pending.get(id)
    if (!handler) return
    this.pending.delete(id)
    clearTimeout(handler.timer)
    handler.resolve(parsed)
  }

  private async request<T>(req: WsRequest): Promise<T> {
    const ws = await this.connect()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req.id)
        reject(new MnemeError('storage_failure', `WebSocket request timed out: ${req.kind}`))
      }, this.requestTimeoutMs)
      this.pending.set(req.id, {
        timer,
        resolve: (response) => {
          if (isErrorResponse(response)) {
            reject(new MnemeError(response.code as MnemeErrorCode, response.message))
            return
          }
          resolve(response as unknown as T)
        },
        reject,
      })
      try {
        ws.send(JSON.stringify(req))
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(req.id)
        const message = err instanceof Error ? err.message : String(err)
        reject(new MnemeError('storage_failure', `WebSocket send failed: ${message}`))
      }
    })
  }
}
