/**
 * Base64url codec used by the protocol's envelope payload fields.
 *
 * Implemented on top of Node's Buffer because Bun, Node 18+, and most
 * runtimes expose it. Avoids a dependency on `@scure/base` for v0.0.3.
 */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64url')
}

export function fromBase64Url(input: string): Uint8Array {
  return new Uint8Array(Buffer.from(input, 'base64url'))
}
