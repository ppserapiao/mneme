/**
 * AES-256-GCM authenticated encryption via the Web Crypto API.
 *
 * Bun and Node 18+ expose `globalThis.crypto.subtle`, so no external dep is
 * required for the cipher itself. Random bytes via `crypto.getRandomValues`.
 *
 * Nonces are 96-bit per the AES-GCM spec. Generating new random nonces per
 * call is safe as long as the key is rotated long before 2^32 calls.
 */

const KEY_LENGTH_BYTES = 32
const NONCE_LENGTH_BYTES = 12

export type EncryptResult = {
  ciphertext: Uint8Array
  nonce: Uint8Array
}

// Web Crypto's `BufferSource` overlaps awkwardly with TS 5.7+'s generic
// `Uint8Array<ArrayBufferLike>` typing — runtime is identical, but the
// type checker rejects the cross. Treat `crypto.subtle` through a narrow,
// internally-typed adapter rather than scattering casts at every call site.
type SubtleLike = {
  importKey(
    format: 'raw',
    keyData: Uint8Array,
    algorithm: { name: 'AES-GCM' },
    extractable: boolean,
    keyUsages: ReadonlyArray<'encrypt' | 'decrypt'>,
  ): Promise<unknown>
  encrypt(
    algorithm: { name: 'AES-GCM'; iv: Uint8Array; additionalData?: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>
  decrypt(
    algorithm: { name: 'AES-GCM'; iv: Uint8Array; additionalData?: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>
}

// Web Crypto's BufferSource type conflicts with TS 5.7's generic Uint8Array
// typing. The cast is at a single adapter boundary; everything past it is
// strongly typed via SubtleLike above.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
const subtle = crypto.subtle as any as SubtleLike

/** Generate a 256-bit random key suitable for AES-GCM. */
export function generateDataKey(): Uint8Array {
  const key = new Uint8Array(KEY_LENGTH_BYTES)
  crypto.getRandomValues(key)
  return key
}

/** Generate a 96-bit random nonce suitable for AES-GCM. */
export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(NONCE_LENGTH_BYTES)
  crypto.getRandomValues(nonce)
  return nonce
}

/** Generate a cryptographically random byte string of arbitrary length. */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Encrypt `plaintext` with `key` under AES-256-GCM. If `aad` is provided it
 * MUST be passed identically to `decrypt`; mismatch raises an error.
 */
export async function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  aad?: Uint8Array,
): Promise<EncryptResult> {
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`AES-256-GCM key must be ${KEY_LENGTH_BYTES} bytes (got ${key.length})`)
  }
  const nonce = generateNonce()
  const cryptoKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt'])
  const params: { name: 'AES-GCM'; iv: Uint8Array; additionalData?: Uint8Array } = {
    name: 'AES-GCM',
    iv: nonce,
  }
  if (aad !== undefined) params.additionalData = aad
  const ciphertext = await subtle.encrypt(params, cryptoKey, plaintext)
  return { ciphertext: new Uint8Array(ciphertext), nonce }
}

/**
 * Decrypt `ciphertext` with `key` and `nonce`. Returns the plaintext bytes.
 * If `aad` does not match the value used during encryption, the GCM tag
 * check fails and the call throws.
 */
export async function decrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`AES-256-GCM key must be ${KEY_LENGTH_BYTES} bytes (got ${key.length})`)
  }
  const cryptoKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt'])
  const params: { name: 'AES-GCM'; iv: Uint8Array; additionalData?: Uint8Array } = {
    name: 'AES-GCM',
    iv: nonce,
  }
  if (aad !== undefined) params.additionalData = aad
  const plaintext = await subtle.decrypt(params, cryptoKey, ciphertext)
  return new Uint8Array(plaintext)
}
