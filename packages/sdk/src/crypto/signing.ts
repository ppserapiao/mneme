import { ed25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

const SIGNING_KEY_INFO = new TextEncoder().encode('mneme-signing-v1')
const SIGNING_KEY_LENGTH = 32

export type SigningKeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

/**
 * Deterministically derive an Ed25519 signing keypair from the master key
 * via HKDF-SHA256. Same master key always produces the same signing keys,
 * so a user who unlocks with their recovery phrase ends up with the same
 * public key — important for external verification stability.
 *
 * The signing private key is therefore never persisted separately; we
 * regenerate it from the master key on every open.
 */
export function deriveSigningKeyPair(masterKey: Uint8Array): SigningKeyPair {
  const privateKey = hkdf(sha256, masterKey, undefined, SIGNING_KEY_INFO, SIGNING_KEY_LENGTH)
  const publicKey = ed25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

/**
 * Canonical bytes signed for a single record. The exact byte sequence is:
 *
 *   ownerId || \0 || id || \0 || createdAt || \0 || body.mode || \0 || content
 *
 * where `content` is `body.data` for plaintext payloads and `body.ciphertext`
 * for encrypted ones. The fixed `\0` separator is safe because the fields
 * are constrained types — ULIDs, ISO-8601 timestamps, a fixed enum, and
 * base64url — none of which contain a null byte.
 *
 * Any external party can recompute this from a `MemoryRecord` and verify the
 * signature against the owner's public key.
 */
export function recordSigningPayload(input: {
  ownerId: string
  id: string
  createdAt: string
  body: { mode: 'plaintext'; data: string } | { mode: 'aes-gcm-256'; ciphertext: string }
}): Uint8Array {
  const enc = new TextEncoder()
  const sep = new Uint8Array([0])
  const ownerId = enc.encode(input.ownerId)
  const id = enc.encode(input.id)
  const createdAt = enc.encode(input.createdAt)
  const mode = enc.encode(input.body.mode)
  const content = enc.encode(
    input.body.mode === 'plaintext' ? input.body.data : input.body.ciphertext,
  )

  const parts: ReadonlyArray<Uint8Array> = [
    ownerId,
    sep,
    id,
    sep,
    createdAt,
    sep,
    mode,
    sep,
    content,
  ]
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export function sign(payload: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(payload, privateKey)
}

export function verify(signature: Uint8Array, payload: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, payload, publicKey)
  } catch {
    return false
  }
}
