import {
  type InitializeResult,
  type KdfParams,
  Mneme,
  MnemeError,
  type PairingSession,
} from '@mneme/sdk'
import type { Server, ServerWebSocket } from 'bun'
import { type WsRequest, type WsResponse, isErrorResponse, newRequestId } from './protocol'

// ---------------------------------------------------------------------------
// Device A — host a pairing endpoint
// ---------------------------------------------------------------------------

type PairingWsData = {
  session: PairingSession | undefined
  completed: Awaited<ReturnType<PairingSession['complete']>> | undefined
}

export type ServeForPairingOptions = {
  /** Port to bind. `0` (default) lets the OS pick. */
  port?: number
  /**
   * Called once the server is bound, with the resolved ws:// URL. Useful
   * for printing a pair-target the user can read off to device B (and for
   * encoding into a QR code).
   */
  onUrlReady?: (url: string) => void
  /**
   * Called when the 6-digit SAS becomes available on device A. The user
   * must verify it matches the SAS displayed on device B; return `true`
   * to commit the master-key bundle, `false` to abort.
   */
  onSasReady: (sas: string) => Promise<boolean> | boolean
}

export type ServeForPairingResult = { paired: true } | { paired: false; reason: string }

/**
 * Host a one-shot pairing endpoint on device A. The function returns once a
 * pairing attempt completes (either successfully or with the user rejecting
 * the SAS / the peer disconnecting).
 *
 * The server accepts the FIRST incoming connection and rejects subsequent
 * ones — pairing is a one-shot ceremony. After it resolves, the server
 * is stopped.
 *
 * ⚠️  Like {@link WebSocketSyncServer}, this listener has no authentication
 * in v0.0.8 — only use on loopback or a network you control.
 */
export function serveForPairing(
  alice: Mneme,
  options: ServeForPairingOptions,
): Promise<ServeForPairingResult> {
  if (!alice.encrypted) {
    return Promise.reject(
      new MnemeError(
        'invalid_record',
        'pairing requires an encrypted Mneme; initialise or open with a passphrase first',
      ),
    )
  }

  let server: Server<PairingWsData> | undefined
  let alreadyConnected = false
  let settled = false
  let resolveResult: ((r: ServeForPairingResult) => void) | undefined
  let rejectResult: ((e: Error) => void) | undefined

  const finish = (result: ServeForPairingResult) => {
    if (settled) return
    settled = true
    server?.stop(true)
    server = undefined
    resolveResult?.(result)
  }
  const fail = (err: Error) => {
    if (settled) return
    settled = true
    server?.stop(true)
    server = undefined
    rejectResult?.(err)
  }

  return new Promise<ServeForPairingResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject

    server = Bun.serve<PairingWsData>({
      port: options.port ?? 0,
      fetch(req, srv): Response | undefined {
        if (alreadyConnected) {
          return new Response('mneme pairing: session already in progress', { status: 503 })
        }
        if (srv.upgrade(req, { data: { session: undefined, completed: undefined } })) {
          alreadyConnected = true
          return undefined
        }
        return new Response('mneme pairing: WebSocket only', { status: 426 })
      },
      websocket: {
        async message(ws: ServerWebSocket<PairingWsData>, raw: string | Buffer) {
          const data = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
          let request: WsRequest
          try {
            request = JSON.parse(data) as WsRequest
          } catch (err) {
            sendError(ws, undefined, 'invalid_record', `invalid JSON: ${describe(err)}`)
            return
          }
          try {
            switch (request.kind) {
              case 'pair:start': {
                if (ws.data.session !== undefined) {
                  throw new MnemeError('conflict', 'pair:start already issued on this connection')
                }
                const session = alice.beginPairing()
                ws.data.session = session
                ws.send(
                  jsonResponse({
                    kind: 'pair:start:ok',
                    id: request.id,
                    invite: session.invite,
                  }),
                )
                return
              }
              case 'pair:respond': {
                const session = ws.data.session
                if (session === undefined) {
                  throw new MnemeError('conflict', 'no active pairing session for this connection')
                }
                const completed = await session.complete(request.response)
                const userConfirmed = await options.onSasReady(completed.sas)
                if (!userConfirmed) {
                  sendError(ws, request.id, 'unauthorized', 'SAS rejected by user on device A')
                  ws.close(1008, 'sas_rejected')
                  finish({ paired: false, reason: 'sas_rejected_on_a' })
                  return
                }
                ws.data.completed = completed
                ws.send(
                  jsonResponse({
                    kind: 'pair:respond:ok',
                    id: request.id,
                    sas: completed.sas,
                  }),
                )
                return
              }
              case 'pair:commit': {
                const completed = ws.data.completed
                if (completed === undefined) {
                  throw new MnemeError(
                    'conflict',
                    'no completed pairing to commit (verify SAS first)',
                  )
                }
                const bundle = await completed.commit()
                ws.send(
                  jsonResponse({
                    kind: 'pair:commit:ok',
                    id: request.id,
                    bundle,
                  }),
                )
                // Mark settled BEFORE closing the socket — the `close`
                // handler below would otherwise race in and resolve as
                // `connection_closed`.
                finish({ paired: true })
                ws.close(1000, 'paired')
                return
              }
              default:
                throw new MnemeError(
                  'invalid_record',
                  `unexpected request on pairing endpoint: ${request.kind}`,
                )
            }
          } catch (err) {
            const code = MnemeError.is(err) ? err.code : 'storage_failure'
            sendError(ws, request.id, code, err instanceof Error ? err.message : String(err))
          }
        },
        close() {
          // If the connection drops before commit, mark as unpaired.
          if (resolveResult) finish({ paired: false, reason: 'connection_closed' })
        },
      },
    })

    if (options.onUrlReady) {
      const host = server.hostname === '::' ? 'localhost' : server.hostname
      options.onUrlReady(`ws://${host}:${server.port}`)
    }
  }).catch((err) => {
    fail(err)
    throw err
  })
}

// ---------------------------------------------------------------------------
// Device B — connect to a pairing endpoint and finalise
// ---------------------------------------------------------------------------

export type PairOverWebSocketOptions = {
  /** ws:// URL of device A's pairing endpoint. */
  url: string
  /** Passphrase to wrap device B's new local keyring. */
  passphrase: string
  /** Local SQLite path. Defaults to the platform-appropriate location. */
  path?: string
  /** Logical owner. Defaults to `"local"`. */
  ownerId?: string
  /** Argon2id parameters for device B's keyring. Defaults to OWASP interactive. */
  kdfParams?: KdfParams
  /**
   * Called when the 6-digit SAS becomes available on device B. The user
   * must verify it matches the SAS displayed on device A; return `true`
   * to proceed, `false` to abort the pairing.
   */
  onSasReady: (sas: string) => Promise<boolean> | boolean
  /** Per-request timeout in milliseconds. Defaults to 30 000. */
  requestTimeoutMs?: number
}

/**
 * Pair device B with a remote device A over a WebSocket. Drives the
 * three-message ceremony (`pair:start` → `pair:respond` → `pair:commit`)
 * with the user-verified SAS callback gating the commit.
 *
 * Returns a freshly-initialised `Mneme` whose keyring is wrapped under
 * device B's own passphrase and a new 24-word recovery phrase (returned
 * exactly once), all sealing the same master key as device A.
 */
export async function pairOverWebSocket(
  options: PairOverWebSocketOptions,
): Promise<InitializeResult> {
  const ws = new WebSocket(options.url)
  await waitForOpen(ws, options.requestTimeoutMs ?? 30_000)

  const respond = makeResponder(ws, options.requestTimeoutMs ?? 30_000)

  try {
    // 1. Ask A for the invite.
    const inviteResp = await respond({ kind: 'pair:start', id: newRequestId() })
    if (inviteResp.kind !== 'pair:start:ok') {
      throw mismatch(inviteResp, 'pair:start:ok')
    }

    // 2. Accept invite locally → derive SAS + response.
    const accepted = await Mneme.acceptPairing(inviteResp.invite)
    const userConfirmed = await options.onSasReady(accepted.sas)
    if (!userConfirmed) {
      ws.close(1000, 'sas_rejected_on_b')
      throw new MnemeError('unauthorized', 'SAS rejected by user on device B')
    }

    // 3. Send B's response to A so A can show its SAS to its user.
    const respondAck = await respond({
      kind: 'pair:respond',
      id: newRequestId(),
      response: accepted.response,
    })
    if (respondAck.kind !== 'pair:respond:ok') {
      throw mismatch(respondAck, 'pair:respond:ok')
    }
    // (Sanity: A's and B's SAS MUST match — derived from same shared secret.)
    if (respondAck.sas !== accepted.sas) {
      throw new MnemeError(
        'invalid_record',
        'SAS mismatch between A and B — channel may be compromised',
      )
    }

    // 4. Ask A to commit; receive the bundle.
    const bundleResp = await respond({ kind: 'pair:commit', id: newRequestId() })
    if (bundleResp.kind !== 'pair:commit:ok') {
      throw mismatch(bundleResp, 'pair:commit:ok')
    }

    // 5. Finalise locally — wraps the transferred master key under B's
    //    passphrase + fresh recovery phrase.
    const result = await accepted.finalize(bundleResp.bundle, {
      passphrase: options.passphrase,
      ...(options.path !== undefined ? { path: options.path } : {}),
      ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}),
      ...(options.kdfParams !== undefined ? { kdfParams: options.kdfParams } : {}),
    })
    return result
  } finally {
    if (ws.readyState <= WebSocket.OPEN) ws.close(1000, 'pairing_done')
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(payload: WsResponse): string {
  return JSON.stringify(payload)
}

function sendError(
  ws: ServerWebSocket<PairingWsData>,
  id: string | undefined,
  code: string,
  message: string,
): void {
  const payload: WsResponse =
    id !== undefined
      ? { kind: 'error', id, code: code as never, message }
      : { kind: 'error', code: code as never, message }
  ws.send(jsonResponse(payload))
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function waitForOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      reject(new MnemeError('storage_failure', `WebSocket open timed out: ${ws.url}`))
    }, timeoutMs)
    const onOpen = () => {
      clearTimeout(timer)
      ws.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      clearTimeout(timer)
      ws.removeEventListener('open', onOpen)
      reject(new MnemeError('storage_failure', `WebSocket open failed: ${ws.url}`))
    }
    ws.addEventListener('open', onOpen, { once: true })
    ws.addEventListener('error', onError, { once: true })
  })
}

function makeResponder(ws: WebSocket, timeoutMs: number) {
  const pending = new Map<
    string,
    {
      resolve: (r: WsResponse) => void
      reject: (e: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  ws.addEventListener('message', (ev: MessageEvent) => {
    const data = typeof ev.data === 'string' ? ev.data : ''
    let parsed: WsResponse
    try {
      parsed = JSON.parse(data) as WsResponse
    } catch {
      return
    }
    const id = parsed.id
    if (id === undefined) return
    const handler = pending.get(id)
    if (!handler) return
    pending.delete(id)
    clearTimeout(handler.timer)
    if (isErrorResponse(parsed)) {
      handler.reject(new MnemeError(parsed.code, parsed.message))
      return
    }
    handler.resolve(parsed)
  })
  ws.addEventListener('close', () => {
    for (const [, h] of pending) {
      clearTimeout(h.timer)
      h.reject(new MnemeError('storage_failure', 'WebSocket closed before response'))
    }
    pending.clear()
  })

  return (req: WsRequest): Promise<WsResponse> => {
    return new Promise<WsResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(req.id)
        reject(new MnemeError('storage_failure', `WebSocket request timed out: ${req.kind}`))
      }, timeoutMs)
      pending.set(req.id, { resolve, reject, timer })
      try {
        ws.send(JSON.stringify(req))
      } catch (err) {
        clearTimeout(timer)
        pending.delete(req.id)
        reject(
          new MnemeError(
            'storage_failure',
            `WebSocket send failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        )
      }
    })
  }
}

function mismatch(resp: WsResponse, expected: string): MnemeError {
  return new MnemeError(
    'invalid_record',
    `unexpected pairing response: expected ${expected}, got ${resp.kind}`,
  )
}
