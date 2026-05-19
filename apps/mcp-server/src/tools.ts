import { MEMORY_KINDS, type MemoryKind, type Mneme, MnemeError } from '@mneme/sdk'
import { z } from 'zod'

/**
 * Tool result content block — narrowed to the text variant we use here.
 * Mirrors the shape `CallToolResult.content` expects in the MCP SDK.
 */
export type ToolTextResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/** Wrap a value as a single text-content tool response (pretty-printed JSON). */
function jsonResult(value: unknown): ToolTextResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/** Wrap an error as an MCP error-content response. */
function errorResult(message: string, code?: string): ToolTextResult {
  const body = code ? { error: { code, message } } : { error: { message } }
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    isError: true,
  }
}

function handlerError(err: unknown): ToolTextResult {
  if (MnemeError.is(err)) return errorResult(err.message, err.code)
  const message = err instanceof Error ? err.message : String(err)
  return errorResult(message)
}

// The Zod shapes below are used by the MCP SDK for input validation. Keeping
// them tight (enums, length bounds) means a Claude Code prompt that asks the
// model to call an mneme tool surfaces clear validation errors at the tool
// boundary, not somewhere inside @mneme/sdk.

const KIND_VALUES = MEMORY_KINDS as ReadonlyArray<MemoryKind>
const kindSchema = z.enum(KIND_VALUES as [MemoryKind, ...MemoryKind[]])

export const rememberSchema = {
  kind: kindSchema.describe(
    'Category of the memory: fact, preference, event, relationship, context, or skill.',
  ),
  body: z.string().min(1).max(8000).describe('The memory content as plain text.'),
  sourceApp: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Identifier of the app writing this memory (e.g. "claude-code").'),
  sourceContext: z
    .string()
    .max(1000)
    .optional()
    .describe('Free-form context where this memory originated.'),
  confidence: z.number().min(0).max(1).optional().describe('Model-assigned confidence in [0, 1].'),
  tags: z.array(z.string().min(1).max(64)).max(64).optional().describe('Up to 64 short tags.'),
}

export const recallSchema = {
  query: z.string().min(1).max(2000).describe('Natural-language query against memory bodies.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum results to return (default 10).'),
  kinds: z
    .array(kindSchema)
    .max(MEMORY_KINDS.length)
    .optional()
    .describe('Restrict results to these kinds.'),
}

export const getSchema = {
  id: z
    .string()
    .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    .describe('ULID of the memory.'),
}

export const forgetSchema = {
  id: z
    .string()
    .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    .describe('ULID of the memory to forget.'),
  hard: z
    .boolean()
    .optional()
    .describe('When true, schedule a hard delete in addition to expiring.'),
}

export const supersedeSchema = {
  id: z
    .string()
    .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    .describe('ULID of the memory being replaced.'),
  kind: kindSchema,
  body: z.string().min(1).max(8000),
  sourceApp: z.string().min(1).max(128).optional(),
  sourceContext: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().min(1).max(64)).max(64).optional(),
}

export const exportSchema = {
  since: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('ISO-8601 lower bound. If omitted, exports from beginning of time.'),
}

// The `| undefined` suffix on optional fields satisfies
// `exactOptionalPropertyTypes: true` — Zod produces `{ key: T | undefined }`
// for `.optional()` rather than omitting the key.
export type RememberArgs = {
  kind: MemoryKind
  body: string
  sourceApp?: string | undefined
  sourceContext?: string | undefined
  confidence?: number | undefined
  tags?: ReadonlyArray<string> | undefined
}

export type RecallArgs = {
  query: string
  limit?: number | undefined
  kinds?: ReadonlyArray<MemoryKind> | undefined
}

export type GetArgs = { id: string }
export type ForgetArgs = { id: string; hard?: boolean | undefined }
export type SupersedeArgs = RememberArgs & { id: string }
export type ExportArgs = { since?: string | undefined }

/**
 * Build the set of tool handlers backed by a given `Mneme`. Returned as a
 * map so the server module can register them by name without re-listing
 * argument shapes.
 */
export function makeHandlers(mneme: Mneme): {
  remember: (args: RememberArgs) => Promise<ToolTextResult>
  recall: (args: RecallArgs) => Promise<ToolTextResult>
  get: (args: GetArgs) => Promise<ToolTextResult>
  forget: (args: ForgetArgs) => Promise<ToolTextResult>
  supersede: (args: SupersedeArgs) => Promise<ToolTextResult>
  export: (args: ExportArgs) => Promise<ToolTextResult>
} {
  return {
    async remember(args) {
      try {
        const record = await mneme.remember({
          kind: args.kind,
          body: args.body,
          ...(args.sourceApp !== undefined ? { sourceApp: args.sourceApp } : {}),
          ...(args.sourceContext !== undefined ? { sourceContext: args.sourceContext } : {}),
          ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        })
        return jsonResult(record)
      } catch (err) {
        return handlerError(err)
      }
    },

    async recall(args) {
      try {
        const matches = await mneme.recall(args.query, {
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.kinds !== undefined ? { kinds: args.kinds } : {}),
        })
        return jsonResult(matches)
      } catch (err) {
        return handlerError(err)
      }
    },

    async get(args) {
      try {
        const record = await mneme.get(args.id as never)
        return jsonResult(record)
      } catch (err) {
        return handlerError(err)
      }
    },

    async forget(args) {
      try {
        await mneme.forget(args.id as never, args.hard !== undefined ? { hard: args.hard } : {})
        return jsonResult({ ok: true, id: args.id })
      } catch (err) {
        return handlerError(err)
      }
    },

    async supersede(args) {
      try {
        const record = await mneme.supersede(args.id as never, {
          kind: args.kind,
          body: args.body,
          ...(args.sourceApp !== undefined ? { sourceApp: args.sourceApp } : {}),
          ...(args.sourceContext !== undefined ? { sourceContext: args.sourceContext } : {}),
          ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        })
        return jsonResult(record)
      } catch (err) {
        return handlerError(err)
      }
    },

    async export(_args) {
      try {
        const all = []
        for await (const r of mneme.exportAll()) {
          all.push(r)
        }
        return jsonResult(all)
      } catch (err) {
        return handlerError(err)
      }
    },
  }
}
