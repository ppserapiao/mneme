import { z } from 'zod'

export const MemoryKindSchema = z.enum([
  'fact',
  'preference',
  'event',
  'relationship',
  'context',
  'skill',
])

export type MemoryKind = z.infer<typeof MemoryKindSchema>

export const MEMORY_KINDS: ReadonlyArray<MemoryKind> = Object.freeze([
  'fact',
  'preference',
  'event',
  'relationship',
  'context',
  'skill',
])
