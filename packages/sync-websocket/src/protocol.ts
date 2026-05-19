import type {
  MemoryRecord,
  MnemeErrorCode,
  PairingInvite,
  PairingResponse,
  PairingTransferBundle,
  SyncCatalogEntry,
} from '@mnemehq/sdk'

/**
 * Wire protocol for `@mnemehq/sync-websocket` (ADR 0010).
 *
 * Every message is JSON over a single WebSocket connection. Requests carry a
 * `id`; responses echo the same `id` so concurrent in-flight requests can be
 * correlated. `error` responses include the originating request's `id`.
 */

export type WsRequest =
  | { kind: 'sync:catalog'; id: string; ownerId: string }
  | { kind: 'sync:fetch'; id: string; ownerId: string; ids: ReadonlyArray<string> }
  | { kind: 'sync:push'; id: string; ownerId: string; records: ReadonlyArray<MemoryRecord> }
  | { kind: 'pair:start'; id: string }
  | { kind: 'pair:respond'; id: string; response: PairingResponse }
  | { kind: 'pair:commit'; id: string }

export type WsResponse =
  | { kind: 'sync:catalog:ok'; id: string; entries: ReadonlyArray<SyncCatalogEntry> }
  | { kind: 'sync:fetch:ok'; id: string; records: ReadonlyArray<MemoryRecord> }
  | { kind: 'sync:push:ok'; id: string }
  | { kind: 'pair:start:ok'; id: string; invite: PairingInvite }
  | { kind: 'pair:respond:ok'; id: string; sas: string }
  | { kind: 'pair:commit:ok'; id: string; bundle: PairingTransferBundle }
  | { kind: 'error'; id?: string; code: MnemeErrorCode; message: string }

/** Type guard for the error variant. */
export function isErrorResponse(msg: WsResponse): msg is Extract<WsResponse, { kind: 'error' }> {
  return msg.kind === 'error'
}

/** Generate a random request id. */
export function newRequestId(): string {
  return crypto.randomUUID()
}
