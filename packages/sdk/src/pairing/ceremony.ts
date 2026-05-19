import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

const SESSION_KEY_INFO = new TextEncoder().encode('mneme-pairing-v1-session')
const SAS_INFO = new TextEncoder().encode('mneme-pairing-v1-sas')
const SESSION_KEY_LENGTH = 32 // AES-256
const SAS_LENGTH_BYTES = 4 // → uint32 → 6 decimal digits
const SAS_DIGITS = 6
const SAS_MODULUS = 10 ** SAS_DIGITS

export type EphemeralKeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

/**
 * Generate a fresh X25519 keypair for one pairing session. Both A and B
 * call this independently. Keys are discarded after the ceremony.
 */
export function generateEphemeralKeyPair(): EphemeralKeyPair {
  const privateKey = x25519.utils.randomSecretKey()
  const publicKey = x25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

/**
 * X25519 ECDH. Identical shared secret derived on both sides when each
 * party uses the other's public key. A man-in-the-middle who substituted
 * keys ends up with a different shared secret on at least one side,
 * which causes the SAS comparison to fail.
 */
export function deriveSharedSecret(
  ownPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(ownPrivateKey, peerPublicKey)
}

/** HKDF-derived session key used to encrypt the master-key bundle. */
export function deriveSessionKey(sharedSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, undefined, SESSION_KEY_INFO, SESSION_KEY_LENGTH)
}

/**
 * HKDF-derived Short Authentication String — 6 decimal digits the user
 * compares between the two devices. Domain-separated from the session key
 * so leaking the SAS does not leak key material.
 *
 * Always returns a 6-character string left-padded with zeroes.
 */
export function deriveSas(sharedSecret: Uint8Array): string {
  const raw = hkdf(sha256, sharedSecret, undefined, SAS_INFO, SAS_LENGTH_BYTES)
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const code = view.getUint32(0, false) % SAS_MODULUS
  return code.toString().padStart(SAS_DIGITS, '0')
}
