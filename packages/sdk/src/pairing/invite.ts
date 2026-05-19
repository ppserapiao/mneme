import { MnemeError } from '@mnemehq/protocol'
import { ulid } from 'ulid'
import { encrypt, fromBase64Url, toBase64Url } from '../crypto'
import {
  type EphemeralKeyPair,
  deriveSas,
  deriveSessionKey,
  deriveSharedSecret,
  generateEphemeralKeyPair,
} from './ceremony'
import type { PairingInvite, PairingResponse, PairingTransferBundle } from './types'

const PROTOCOL_VERSION = 'mneme-pairing-v1'
const SESSION_TTL_MS = 5 * 60 * 1000

export type PairingSession = {
  /** The invite to hand to device B. */
  readonly invite: PairingInvite
  /**
   * Continue after device B sends back a response.
   *
   * Returns the 6-digit SAS the user must verify matches device B's display,
   * plus a `commit()` to call once the user has confirmed the match.
   */
  complete(response: PairingResponse): Promise<{
    sas: string
    commit(): Promise<PairingTransferBundle>
  }>
}

/**
 * Begin a pairing session on the device that already holds the master key
 * (device A). Generates an ephemeral X25519 keypair and an invite to share
 * with device B by any out-of-band channel the user trusts.
 *
 * The private key is held in memory for the lifetime of the session.
 * Sessions expire after 5 minutes.
 *
 * `masterKey` is the unwrapped 32-byte master key from this device's
 * keyring — never persisted, never logged.
 */
export function beginPairing(masterKey: Uint8Array): PairingSession {
  if (masterKey.length !== 32) {
    throw new MnemeError(
      'invalid_record',
      `master key must be 32 bytes for pairing (got ${masterKey.length})`,
    )
  }
  const ephemeral: EphemeralKeyPair = generateEphemeralKeyPair()
  const sessionId = ulid()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const invite: PairingInvite = {
    sessionId,
    pubA: toBase64Url(ephemeral.publicKey),
    expiresAt,
    version: PROTOCOL_VERSION,
  }

  let masterKeyBytes: Uint8Array | undefined = new Uint8Array(masterKey)
  let privateKey: Uint8Array | undefined = ephemeral.privateKey

  return {
    invite,
    async complete(response) {
      if (privateKey === undefined || masterKeyBytes === undefined) {
        throw new MnemeError('conflict', 'pairing session has already been completed or discarded')
      }
      if (response.sessionId !== sessionId) {
        throw new MnemeError(
          'invalid_record',
          `pairing response sessionId mismatch (expected ${sessionId})`,
        )
      }
      if (Date.now() >= new Date(expiresAt).getTime()) {
        throw new MnemeError('protocol_version_mismatch', 'pairing session expired')
      }

      const pubB = fromBase64Url(response.pubB)
      const shared = deriveSharedSecret(privateKey, pubB)
      const sessionKey = deriveSessionKey(shared)
      const sas = deriveSas(shared)

      let committed = false
      return {
        sas,
        async commit() {
          if (committed) {
            throw new MnemeError('conflict', 'pairing bundle has already been committed')
          }
          committed = true
          const aad = new TextEncoder().encode(sessionId)
          const { ciphertext, nonce } = await encrypt(masterKeyBytes as Uint8Array, sessionKey, aad)
          // Discard the ephemeral private key and the in-memory master-key
          // copy immediately. From this point on this session cannot be
          // re-used to transfer another bundle.
          privateKey = undefined
          masterKeyBytes = undefined
          return {
            sessionId,
            encryptedMasterKey: toBase64Url(ciphertext),
            nonce: toBase64Url(nonce),
          }
        },
      }
    },
  }
}
