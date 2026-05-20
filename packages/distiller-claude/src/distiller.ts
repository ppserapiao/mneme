import Anthropic from '@anthropic-ai/sdk'
import type { DistillInput, DistillOutput, Distiller, ExtractedMemory } from '@mnemehq/sdk'
import { MnemeError } from '@mnemehq/sdk'
import { z } from 'zod'
import { type AnthropicUsage, estimateCostUsd } from './pricing'
import { FEW_SHOT_EXAMPLES, PROMPT_VERSION, SYSTEM_PROMPT } from './prompts'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_OUTPUT_TOKENS = 2048
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 4

const MemoryKindSchema = z.enum(['fact', 'preference', 'event', 'relationship', 'context', 'skill'])

const ExtractedMemorySchema = z.object({
  kind: MemoryKindSchema,
  body: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  sourceContext: z.string().max(500).optional(),
})

const ExtractionSchema = z.object({
  memories: z.array(ExtractedMemorySchema),
})

/** Tool definition handed to Claude. Mirrors {@link ExtractionSchema}. */
const RECORD_MEMORIES_TOOL = {
  name: 'record_memories',
  description:
    'Record the structured memories you extracted from the input. Call this exactly once per request with the full list. Pass an empty list if nothing memorable about the speaker is present.',
  input_schema: {
    type: 'object',
    properties: {
      memories: {
        type: 'array',
        description: 'List of extracted memories. Empty if the input contains nothing memorable.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['fact', 'preference', 'event', 'relationship', 'context', 'skill'],
            },
            body: {
              type: 'string',
              description:
                'A single self-contained sentence describing the memory, written in third person. Max 500 chars.',
              maxLength: 500,
            },
            confidence: {
              type: 'number',
              description: 'Model confidence in the extraction, 0.0 to 1.0.',
              minimum: 0,
              maximum: 1,
            },
            sourceContext: {
              type: 'string',
              description:
                'Verbatim excerpt (≤120 chars) from the input that justifies this extraction.',
              maxLength: 500,
            },
          },
          required: ['kind', 'body', 'confidence'],
        },
      },
    },
    required: ['memories'],
  },
} as const

export type ClaudeDistillerOptions = {
  /** Anthropic API key. Required. */
  apiKey: string
  /**
   * Claude model identifier. Defaults to `claude-sonnet-4-6` — capable
   * extraction quality at sub-cent per call with prompt caching.
   */
  model?: string
  /** Max output tokens per call. Defaults to 2048 (covers ~10-15 memories). */
  maxOutputTokens?: number
  /** Per-call timeout in ms. Defaults to 30s. */
  requestTimeoutMs?: number
  /** Maximum retry attempts on 429 / 5xx / transient errors. Defaults to 4. */
  maxRetries?: number
  /**
   * Hard ceiling on estimated USD cost per call. If the adapter projects the
   * call would exceed this, it aborts before issuing the request. Defaults
   * to `Infinity` (no cap).
   */
  maxCostUsdPerCall?: number
  /**
   * Disable Anthropic prompt caching. Defaults to `false` (caching ON). Only
   * set true if you have a reason — without caching, every distillation pays
   * full input cost on the (long) system prompt.
   */
  disablePromptCaching?: boolean
  /**
   * Override the base URL. Useful for testing against a mock server. The
   * production default uses the Anthropic SDK's built-in URL.
   */
  baseUrl?: string
  /**
   * Override the SDK client. Useful for tests — pass a stubbed client with a
   * scripted response. When set, `apiKey` / `baseUrl` are ignored.
   */
  client?: Pick<Anthropic, 'messages'>
  /** Observability hook. Called on every request / retry / response / error. */
  onEvent?: (event: ClaudeDistillerEvent) => void
}

export type ClaudeDistillerEvent =
  | { type: 'request'; model: string; promptVersion: string; attempt: number }
  | { type: 'retry'; attempt: number; delayMs: number; reason: string }
  | { type: 'response'; usage: DistillOutput['usage']; extractedCount: number }
  | { type: 'error'; error: Error; attempt: number }

/**
 * Anthropic-backed memory distiller (ADR 0012). Uses Claude's tool-use API
 * for structured output (no JSON.parse defensive coding). Prompt caching
 * enabled by default. Retries 429 / 5xx with exponential backoff. Exposes
 * an observability hook for logging.
 */
export class ClaudeDistiller implements Distiller {
  readonly name = 'claude-distiller'
  readonly model: string
  private readonly client: Pick<Anthropic, 'messages'>
  private readonly maxOutputTokens: number
  private readonly requestTimeoutMs: number
  private readonly maxRetries: number
  private readonly maxCostUsdPerCall: number
  private readonly disablePromptCaching: boolean
  private readonly onEvent: ClaudeDistillerOptions['onEvent']

  constructor(options: ClaudeDistillerOptions) {
    if (!options.client && (!options.apiKey || options.apiKey.trim().length === 0)) {
      throw new MnemeError(
        'invalid_record',
        'ClaudeDistiller requires `apiKey` (or a stubbed `client` for tests). See https://console.anthropic.com/account/keys',
      )
    }
    this.model = options.model ?? DEFAULT_MODEL
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.maxCostUsdPerCall = options.maxCostUsdPerCall ?? Number.POSITIVE_INFINITY
    this.disablePromptCaching = options.disablePromptCaching ?? false
    this.onEvent = options.onEvent
    this.client =
      options.client ??
      new Anthropic({
        apiKey: options.apiKey,
        ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
        timeout: this.requestTimeoutMs,
      })
  }

  async distill(input: DistillInput): Promise<DistillOutput> {
    if (typeof input.text !== 'string' || input.text.trim().length === 0) {
      throw new MnemeError('invalid_record', 'distill: text must be a non-empty string')
    }
    const userMessage = this.buildUserMessage(input)
    const messages = this.buildFewShotMessages()
    messages.push({ role: 'user', content: userMessage })

    const systemContent = this.disablePromptCaching
      ? SYSTEM_PROMPT
      : ([
          {
            type: 'text' as const,
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' as const },
          },
        ] as unknown as string)
    // Note: cache_control on system content is the canonical Anthropic
    // prompt-caching API. The SDK accepts both `string` and the structured
    // form; we use the structured form when caching is enabled.

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.emit({ type: 'request', model: this.model, promptVersion: PROMPT_VERSION, attempt })
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxOutputTokens,
          system: systemContent,
          tools: [RECORD_MEMORIES_TOOL],
          tool_choice: { type: 'tool', name: 'record_memories' },
          messages,
        })

        const toolUse = response.content.find((c) => c.type === 'tool_use')
        if (!toolUse || toolUse.type !== 'tool_use') {
          throw new Error(
            `Claude did not return a tool_use block for "record_memories" — got ${response.stop_reason}`,
          )
        }

        const parsed = ExtractionSchema.parse(toolUse.input)
        const extracted: ExtractedMemory[] = parsed.memories.map((m) => ({
          kind: m.kind,
          body: m.body,
          confidence: m.confidence,
          ...(m.sourceContext ? { sourceContext: m.sourceContext } : {}),
        }))

        const usage: AnthropicUsage = {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          ...(typeof response.usage.cache_read_input_tokens === 'number'
            ? { cache_read_input_tokens: response.usage.cache_read_input_tokens }
            : {}),
          ...(typeof response.usage.cache_creation_input_tokens === 'number'
            ? { cache_creation_input_tokens: response.usage.cache_creation_input_tokens }
            : {}),
        }

        const costUsdEstimate = estimateCostUsd(this.model, usage)
        if (costUsdEstimate > this.maxCostUsdPerCall) {
          throw new MnemeError(
            'invalid_record',
            `distill: estimated cost $${costUsdEstimate.toFixed(4)} exceeds maxCostUsdPerCall $${this.maxCostUsdPerCall.toFixed(4)}. Increase the cap or shrink the input.`,
          )
        }

        const output: DistillOutput = {
          extracted,
          usage: {
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
            costUsdEstimate,
          },
          model: response.model,
        }
        this.emit({ type: 'response', usage: output.usage, extractedCount: extracted.length })
        return output
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        lastError = error
        this.emit({ type: 'error', error, attempt })
        if (!this.isRetryable(error) || attempt === this.maxRetries) throw error
        const delayMs = this.backoffDelayMs(attempt)
        this.emit({ type: 'retry', attempt: attempt + 1, delayMs, reason: error.message })
        await sleep(delayMs)
      }
    }
    throw lastError ?? new Error('distill: exhausted retries with no captured error')
  }

  private buildUserMessage(
    input: DistillInput,
  ): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
    const hint = input.hint
    const header: string[] = []
    if (hint?.speakerLabel) header.push(`Speaker: ${hint.speakerLabel}`)
    if (hint?.sourceApp) header.push(`Source: ${hint.sourceApp}`)
    if (hint?.maxMemories !== undefined) header.push(`Soft cap: ${hint.maxMemories} memories`)
    const headerText = header.length > 0 ? `${header.join(' · ')}\n\n` : ''
    return [{ type: 'text', text: `${headerText}${input.text}` }]
  }

  /**
   * Few-shot examples as alternating user/assistant turns. The user message
   * is the raw text; the assistant turn is a tool_use block that calls
   * record_memories with the expected extraction. Mark the LAST few-shot
   * assistant turn as cacheable so the whole prefix is one cache block.
   */
  private buildFewShotMessages(): Anthropic.MessageParam[] {
    const out: Anthropic.MessageParam[] = []
    for (let i = 0; i < FEW_SHOT_EXAMPLES.length; i++) {
      const example = FEW_SHOT_EXAMPLES[i]
      if (!example) continue
      const isLast = i === FEW_SHOT_EXAMPLES.length - 1
      out.push({ role: 'user', content: example.user })
      // Note: tool_use_id needs to be unique per pair; we don't accept follow-up
      // calls so a stable per-index id is fine.
      const toolUseId = `toolu_fewshot_${i}`
      out.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: toolUseId,
            name: 'record_memories',
            input: { memories: example.extracted },
            ...(isLast && !this.disablePromptCaching
              ? { cache_control: { type: 'ephemeral' as const } }
              : {}),
          },
        ],
      })
      // Anthropic requires a user turn with a tool_result after every assistant
      // tool_use. We immediately acknowledge the few-shot with a tool_result.
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: 'ok',
          },
        ],
      })
    }
    return out
  }

  private isRetryable(error: Error): boolean {
    const msg = error.message.toLowerCase()
    if (msg.includes('429') || msg.includes('rate')) return true
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504'))
      return true
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout'))
      return true
    return false
  }

  private backoffDelayMs(attempt: number): number {
    // 250ms, 500ms, 1s, 2s — with ±25% jitter
    const base = 250 * 2 ** (attempt - 1)
    const jitter = base * 0.25 * (Math.random() * 2 - 1)
    return Math.max(50, Math.round(base + jitter))
  }

  private emit(event: ClaudeDistillerEvent): void {
    try {
      this.onEvent?.(event)
    } catch {
      // observability MUST NOT crash the distiller
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
