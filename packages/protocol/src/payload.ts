import { z } from 'zod'

/**
 * Plaintext payload — body is a UTF-8 string with no encryption applied.
 *
 * Permitted in development and local-first SDK modes. Hosted Mneme stores
 * MUST reject this mode in v0.2+. Implementations should warn when writing
 * a plaintext payload outside a trusted local context.
 */
export const PlaintextPayloadSchema = z.object({
  mode: z.literal('plaintext'),
  data: z.string(),
})
export type PlaintextPayload = z.infer<typeof PlaintextPayloadSchema>

/**
 * AES-256-GCM encrypted payload. The data key is per-record and wrapped by
 * the user's master key (envelope encryption).
 *
 * - `ciphertext`: base64url-encoded ciphertext, IV not included.
 * - `nonce`: base64url-encoded 96-bit GCM nonce, unique per record.
 * - `wrappedKey`: base64url-encoded per-record data key, wrapped by master key.
 * - `aad`: optional Additional Authenticated Data bound to the ciphertext.
 *   When present, MUST include the record ID to prevent ciphertext swapping.
 */
export const EncryptedPayloadSchema = z.object({
  mode: z.literal('aes-gcm-256'),
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  wrappedKey: z.string().min(1),
  aad: z.string().optional(),
})
export type EncryptedPayload = z.infer<typeof EncryptedPayloadSchema>

export const PayloadSchema = z.discriminatedUnion('mode', [
  PlaintextPayloadSchema,
  EncryptedPayloadSchema,
])
export type Payload = z.infer<typeof PayloadSchema>
