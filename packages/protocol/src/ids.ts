import { z } from 'zod'

/**
 * ULID format — 26 characters, Crockford base32.
 * @see https://github.com/ulid/spec
 */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export const MemoryIdSchema = z
  .string()
  .regex(ULID_PATTERN, 'must be a valid ULID')
  .brand<'MemoryId'>()
export type MemoryId = z.infer<typeof MemoryIdSchema>

export const OwnerIdSchema = z.string().min(1).max(256).brand<'OwnerId'>()
export type OwnerId = z.infer<typeof OwnerIdSchema>

export const DeviceIdSchema = z.string().min(1).max(256).brand<'DeviceId'>()
export type DeviceId = z.infer<typeof DeviceIdSchema>
