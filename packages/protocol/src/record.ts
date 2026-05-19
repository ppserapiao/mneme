import { z } from 'zod'
import { MemoryIdSchema, OwnerIdSchema } from './ids'
import { MemoryKindSchema } from './kinds'
import { PayloadSchema } from './payload'

/**
 * ISO-8601 timestamp with timezone offset, millisecond precision.
 * Wire format. Local stores may use any equivalent representation.
 */
export const IsoTimestampSchema = z.string().datetime({ offset: true })
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>

/**
 * Dense vector embedding. Length is implementation-defined; consumers MUST
 * verify dimensionality before similarity computation. Values are float32 in
 * memory, encoded as JSON numbers on the wire.
 */
export const EmbeddingSchema = z.array(z.number().finite())
export type Embedding = z.infer<typeof EmbeddingSchema>

export const MemoryMetadataSchema = z.object({
  createdAt: IsoTimestampSchema,
  sourceApp: z.string().min(1).max(128),
  sourceContext: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().min(1).max(64)).max(64).optional(),
})
export type MemoryMetadata = z.infer<typeof MemoryMetadataSchema>

export const MemoryLifecycleSchema = z.object({
  supersededBy: MemoryIdSchema.optional(),
  expiresAt: IsoTimestampSchema.optional(),
  forgetAt: IsoTimestampSchema.optional(),
})
export type MemoryLifecycle = z.infer<typeof MemoryLifecycleSchema>

/**
 * The atomic unit of memory in the Mneme Protocol.
 *
 * Records are conceptually immutable: "edits" are new records that supersede
 * older ones via `lifecycle.supersededBy`. This sidesteps most CRDT pain at
 * the storage layer and produces a clean, auditable history per logical fact.
 *
 * `signature` is optional in v0.1 (the encryption envelope is not yet
 * specified end-to-end) and REQUIRED from v0.2 onward when device keys land.
 */
export const MemoryRecordSchema = z.object({
  id: MemoryIdSchema,
  ownerId: OwnerIdSchema,
  kind: MemoryKindSchema,
  body: PayloadSchema,
  embedding: EmbeddingSchema.optional(),
  metadata: MemoryMetadataSchema,
  lifecycle: MemoryLifecycleSchema,
  signature: z.string().optional(),
})
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>
