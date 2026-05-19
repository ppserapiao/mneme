import { MnemeError } from '@mneme/protocol'
import { decrypt, fromBase64Url, toBase64Url } from '../crypto'
import {
  type EphemeralKeyPair,
  deriveSas,
  deriveSessionKey,
  deriveSharedSecret,
  generateEphemeralKeyPair,
} from './ceremony'
import type { PairingInvite, PairingResponse, PairingTransferBundle } from './types'

const PROTOCOL_VERSION = 'mneme-pairing-v1'

export type AcceptedPairing = {
  /** The response to send back to device A. */
  readonly response: PairingResponse
  /** 6-digit SAS — MUST be compared with device A's display before finalising. */
  readonly sas: string
  /**
   * Finalise the ceremony with the bundle returned by device A.
   *
   * Decrypts the bundle and returns the raw 32-byte master key. The caller
   * (the Mneme class) is responsible for wrapping it under device B's
   * passphrase + recovery phrase and persisting the new keyring.
   */
  decryptBundle(bundle: PairingTransferBundle): Promise<Uint8Array>
}

/**
 * Accept a pairing invite on a fresh device (device B). Generates an
 * ephemeral X25519 keypair, derives the shared secret, and returns:
 *
 * - the response to ship back to device A,
 * - the 6-digit SAS the user MUST verify matches device A's display,
 * - a `decryptBundle` continuation that decrypts the master key once A's
 *   bundle arrives.
 *
 * The private key is held in memory for the lifetime of this AcceptedPairing
 * value. Calling `decryptBundle` consumes the private key and the session
 * cannot be re-used.
 */
export function acceptPairing(invite: PairingInvite): AcceptedPairing {
  if (invite.version !== PROTOCOL_VERSION) {
    throw new MnemeError(
      'protocol_version_mismatch',
      `unsupported pairing protocol version: ${invite.version}`,
    )
  }
  if (Date.now() >= new Date(invite.expiresAt).getTime()) {
    throw new MnemeError('protocol_version_mismatch', 'pairing invite expired')
  }

  const pubA = fromBase64Url(invite.pubA)
  const ephemeral: EphemeralKeyPair = generateEphemeralKeyPair()
  const shared = deriveSharedSecret(ephemeral.privateKey, pubA)
  const sessionKey = deriveSessionKey(shared)
  const sas = deriveSas(shared)

  const response: PairingResponse = {
    sessionId: invite.sessionId,
    pubB: toBase64Url(ephemeral.publicKey),
  }

  let consumed = false
  let cachedSessionKey: Uint8Array | undefined = sessionKey

  return {
    response,
    sas,
    async decryptBundle(bundle) {
      if (consumed) {
        throw new MnemeError('conflict', 'pairing bundle has already been consumed')
      }
      if (bundle.sessionId !== invite.sessionId) {
        throw new MnemeError(
          'invalid_record',
          `pairing bundle sessionId mismatch (expected ${invite.sessionId})`,
        )
      }
      if (cachedSessionKey === undefined) {
        throw new MnemeError('storage_failure', 'pairing session key missing')
      }
      const ciphertext = fromBase64Url(bundle.encryptedMasterKey)
      const nonce = fromBase64Url(bundle.nonce)
      const aad = new TextEncoder().encode(invite.sessionId)
      let masterKey: Uint8Array
      try {
        masterKey = await decrypt(ciphertext, nonce, cachedSessionKey, aad)
      } catch {
        throw new MnemeError(
          'invalid_record',
          'pairing bundle failed authentication — wrong session key, tampered bundle, or SAS was not verified before transfer',
        )
      }
      consumed = true
      cachedSessionKey = undefined
      if (masterKey.length !== 32) {
        throw new MnemeError(
          'invalid_record',
          `decrypted master key has wrong length: ${masterKey.length}`,
        )
      }
      return masterKey
    },
  }
}
