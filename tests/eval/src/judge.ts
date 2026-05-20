import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedMemory } from '@mnemehq/sdk'
import { z } from 'zod'
import type { MatchResult, Matcher } from './matcher'
import type { ExpectedMemory } from './types'

/**
 * LLM-as-judge matcher (ADR 0014). Calls Anthropic to decide whether an
 * `extracted` memory is semantically equivalent to an `expected` one.
 *
 * Defaults to claude-haiku-4-5 — the judge task is simpler than extraction
 * and Haiku produces reliable decisions at ~5x lower cost than Sonnet.
 *
 * Structured output via tool-use (mirrors `ClaudeDistiller` ADR 0012 §3) so
 * we never JSON.parse free-form text. Prompt-cached system prompt for the
 * ~80-90% input-cost discount within Anthropic's 5-minute cache TTL.
 */
const JudgeOutputSchema = z.object({
  matched: z.boolean(),
  reason: z.string().min(1).max(280),
  confidence: z.number().min(0).max(1),
})

const JUDGE_TOOL = {
  name: 'judge_match',
  description:
    'Record whether the extracted and expected memories are semantically equivalent. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      matched: {
        type: 'boolean',
        description:
          'True if the two memories capture the same underlying signal about the same person, even with different vocabulary.',
      },
      reason: {
        type: 'string',
        description:
          'One short sentence explaining the decision. Cite the specific signal that does or does not align.',
        maxLength: 280,
      },
      confidence: {
        type: 'number',
        description: 'Your confidence in the decision, 0.0 to 1.0.',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['matched', 'reason', 'confidence'],
  },
} as const

export const JUDGE_PROMPT_VERSION = '2026-05-20a'

export const JUDGE_SYSTEM_PROMPT = `You are evaluating whether two memories about the same person are semantically equivalent.

You will receive an EXTRACTED memory (produced by an automated distiller) and an EXPECTED memory (from a curated test corpus). Your job is to decide whether the extracted memory captures the same underlying signal as the expected memory.

DECISION RULES

Two memories MATCH if:
- They are about the same underlying fact / preference / event / relationship / context / skill about the same person.
- They use overlapping phrasing OR clearly equivalent phrasing ("Lives in London" ≈ "Based in London" ≈ "London is home"; "Prefers single-origin coffee" ≈ "Likes single-origin coffee over blends").
- The extracted memory may include additional detail beyond the expected — that's fine, as long as the core signal is preserved.

Two memories DO NOT match if:
- They're about different facts even when phrased similarly ("Prefers tea" vs "Prefers coffee").
- The extracted memory generalises away the specific signal the expected memory captures (expected "Allergic to peanuts" vs extracted "Has dietary restrictions" — too generic).
- The "kind" differs in a way that meaningfully changes how the memory would be used (expected is a \`fact\` about location, extracted is a \`preference\` about a city — these are different kinds of memories).
- The extracted memory attributes a fact to the wrong person, or fuses the speaker with someone else.

CONFIDENCE RUBRIC
- 0.9+   strong match or strong no-match; you would bet money on it
- 0.7    confident decision but reasonable people might disagree
- 0.5    genuinely ambiguous; tip slightly one way

Output your decision via the \`judge_match\` tool. Be strict — a match should be defensible to a reviewer. When in doubt, do NOT match.`

const FEW_SHOT_PROMPTS = [
  {
    input: {
      extractedKind: 'fact',
      extractedBody: 'Resides in London and works in product',
      expectedKind: 'fact',
      expectedGist: 'Lives in London',
    },
    decision: {
      matched: true,
      reason:
        'Both capture residence in London; extracted adds work context but core signal aligns.',
      confidence: 0.95,
    },
  },
  {
    input: {
      extractedKind: 'preference',
      extractedBody: 'Drinks lots of coffee',
      expectedKind: 'preference',
      expectedGist: 'Prefers single-origin coffee over blends',
    },
    decision: {
      matched: false,
      reason:
        'Extracted is about coffee consumption volume; expected is a specific preference for single-origin over blends. Different signals.',
      confidence: 0.9,
    },
  },
  {
    input: {
      extractedKind: 'relationship',
      extractedBody: 'Sarah is a colleague in the marketing department',
      expectedKind: 'relationship',
      expectedGist: 'Sarah works in marketing',
    },
    decision: {
      matched: true,
      reason: 'Both name Sarah as a marketing-side colleague; equivalent.',
      confidence: 0.95,
    },
  },
] as const

export type ClaudeJudgeOptions = {
  /** Anthropic API key. Required unless a stubbed `client` is supplied. */
  apiKey?: string
  /** Judge model. Default: claude-haiku-4-5 (cheap + adequate for this task). */
  model?: string
  /** Per-call timeout in ms. Default: 15_000. */
  requestTimeoutMs?: number
  /** Max retries on 429/5xx. Default: 3. */
  maxRetries?: number
  /**
   * Confidence floor for treating a match as a match. The model may return
   * matched=true with low confidence — we treat anything below this as
   * no-match. Default: 0.7.
   */
  confidenceFloor?: number
  /** Override the SDK client (for tests). */
  client?: Pick<Anthropic, 'messages'>
  /** Observability hook fired on every request / retry / response / error. */
  onEvent?: (event: JudgeEvent) => void
  /** Disable prompt caching on the system prompt. Default: false (caching ON). */
  disablePromptCaching?: boolean
}

export type JudgeEvent =
  | { type: 'request'; attempt: number }
  | { type: 'response'; matched: boolean; confidence: number; costUsdEstimate: number }
  | { type: 'retry'; attempt: number; delayMs: number; reason: string }
  | { type: 'error'; error: Error; attempt: number }

/**
 * Anthropic-backed semantic-equivalence judge. Implements {@link Matcher}.
 *
 * Cost: ~$0.001 per pair on Sonnet, ~$0.0005 on Haiku (cache-warm). A
 * typical eval run with this judge adds ~$0.10 on Haiku, ~$0.30 on Sonnet.
 */
export class ClaudeJudgeMatcher implements Matcher {
  readonly name: string
  readonly model: string
  private readonly client: Pick<Anthropic, 'messages'>
  private readonly requestTimeoutMs: number
  private readonly maxRetries: number
  private readonly confidenceFloor: number
  private readonly onEvent: ClaudeJudgeOptions['onEvent']
  private readonly disablePromptCaching: boolean
  private cumulativeCostUsd = 0

  constructor(options: ClaudeJudgeOptions) {
    if (!options.client && (!options.apiKey || options.apiKey.trim().length === 0)) {
      throw new Error(
        'ClaudeJudgeMatcher requires `apiKey` (or a stubbed `client` for tests). See https://console.anthropic.com/account/keys',
      )
    }
    this.model = options.model ?? 'claude-haiku-4-5'
    this.name = `judge-claude:${this.model}`
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000
    this.maxRetries = options.maxRetries ?? 3
    this.confidenceFloor = options.confidenceFloor ?? 0.7
    this.disablePromptCaching = options.disablePromptCaching ?? false
    this.onEvent = options.onEvent
    this.client =
      options.client ??
      new Anthropic({
        apiKey: options.apiKey ?? '',
        timeout: this.requestTimeoutMs,
      })
  }

  /** Total estimated USD cost across every match() call so far. */
  get totalCostUsdEstimate(): number {
    return Math.round(this.cumulativeCostUsd * 1_000_000) / 1_000_000
  }

  async match(extracted: ExtractedMemory, expected: ExpectedMemory): Promise<MatchResult> {
    const userMessage = this.buildUserMessage(extracted, expected)
    const systemContent = this.disablePromptCaching
      ? JUDGE_SYSTEM_PROMPT
      : ([
          {
            type: 'text' as const,
            text: JUDGE_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' as const },
          },
        ] as unknown as string)

    const fewShotMessages = this.buildFewShotMessages()
    const messages: Anthropic.MessageParam[] = [
      ...fewShotMessages,
      { role: 'user', content: userMessage },
    ]

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.emit({ type: 'request', attempt })
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 400,
          system: systemContent,
          tools: [JUDGE_TOOL],
          tool_choice: { type: 'tool', name: 'judge_match' },
          messages,
        })

        const toolUse = response.content.find((c) => c.type === 'tool_use')
        if (!toolUse || toolUse.type !== 'tool_use') {
          throw new Error(
            `Judge did not return a tool_use block — got stop_reason=${response.stop_reason}`,
          )
        }

        const parsed = JudgeOutputSchema.parse(toolUse.input)
        const cost = estimateJudgeCostUsd(this.model, response.usage)
        this.cumulativeCostUsd += cost

        const matched = parsed.matched && parsed.confidence >= this.confidenceFloor
        const result: MatchResult = {
          matched,
          reason: parsed.reason,
          confidence: parsed.confidence,
        }
        this.emit({
          type: 'response',
          matched: parsed.matched,
          confidence: parsed.confidence,
          costUsdEstimate: cost,
        })
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        lastError = error
        this.emit({ type: 'error', error, attempt })
        if (!isRetryable(error) || attempt === this.maxRetries) throw error
        const delayMs = backoffDelayMs(attempt)
        this.emit({ type: 'retry', attempt: attempt + 1, delayMs, reason: error.message })
        await sleep(delayMs)
      }
    }
    throw lastError ?? new Error('judge: exhausted retries with no captured error')
  }

  private buildUserMessage(
    extracted: ExtractedMemory,
    expected: ExpectedMemory,
  ): Anthropic.MessageParam['content'] {
    return [
      {
        type: 'text' as const,
        text: judgeUserText({
          extractedKind: extracted.kind,
          extractedBody: extracted.body,
          expectedKind: expected.kind,
          expectedGist: expected.gist,
        }),
      },
    ]
  }

  private buildFewShotMessages(): Anthropic.MessageParam[] {
    const out: Anthropic.MessageParam[] = []
    for (let i = 0; i < FEW_SHOT_PROMPTS.length; i++) {
      const example = FEW_SHOT_PROMPTS[i]
      if (!example) continue
      const isLast = i === FEW_SHOT_PROMPTS.length - 1
      out.push({ role: 'user', content: judgeUserText(example.input) })
      const toolUseId = `toolu_judge_fewshot_${i}`
      out.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: toolUseId,
            name: 'judge_match',
            input: example.decision,
            ...(isLast && !this.disablePromptCaching
              ? { cache_control: { type: 'ephemeral' as const } }
              : {}),
          },
        ],
      })
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }],
      })
    }
    return out
  }

  private emit(event: JudgeEvent): void {
    try {
      this.onEvent?.(event)
    } catch {
      // observability MUST NOT crash the matcher
    }
  }
}

function judgeUserText(args: {
  extractedKind: string
  extractedBody: string
  expectedKind: string
  expectedGist: string
}): string {
  return `EXTRACTED (kind=${args.extractedKind}): ${args.extractedBody}\nEXPECTED  (kind=${args.expectedKind}): ${args.expectedGist}\n\nDecide whether these are semantically equivalent. Call the judge_match tool.`
}

/**
 * Price table for the judge models we support. Same shape as the distiller
 * pricing (per-million tokens, split between input/output and cache tiers).
 */
type JudgePriceTable = {
  inputPerMillion: number
  outputPerMillion: number
  cachedInputPerMillion: number
  cacheWritePerMillion: number
}

const JUDGE_PRICES: Record<string, JudgePriceTable> = {
  'claude-haiku-4-5': {
    inputPerMillion: 1,
    outputPerMillion: 5,
    cachedInputPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
  },
  'claude-sonnet-4-7': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cachedInputPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cachedInputPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
}

function estimateJudgeCostUsd(
  model: string,
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number | null
    cache_creation_input_tokens?: number | null
  },
): number {
  const table = resolvePrice(model)
  if (!table) return 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const uncached = Math.max(0, usage.input_tokens - cacheRead - cacheWrite)
  const inputCost =
    (uncached * table.inputPerMillion +
      cacheRead * table.cachedInputPerMillion +
      cacheWrite * table.cacheWritePerMillion) /
    1_000_000
  const outputCost = (usage.output_tokens * table.outputPerMillion) / 1_000_000
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}

function resolvePrice(model: string): JudgePriceTable | undefined {
  const direct = JUDGE_PRICES[model]
  if (direct) return direct
  for (const known of Object.keys(JUDGE_PRICES)) {
    if (model.startsWith(`${known}-`) || model.startsWith(known)) return JUDGE_PRICES[known]
  }
  return undefined
}

function isRetryable(error: Error): boolean {
  const msg = error.message.toLowerCase()
  if (msg.includes('429') || msg.includes('rate')) return true
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504'))
    return true
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout'))
    return true
  return false
}

function backoffDelayMs(attempt: number): number {
  const base = 250 * 2 ** (attempt - 1)
  const jitter = base * 0.25 * (Math.random() * 2 - 1)
  return Math.max(50, Math.round(base + jitter))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
