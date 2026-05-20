import { describe, expect, test } from 'bun:test'
import type Anthropic from '@anthropic-ai/sdk'
import { ClaudeDistiller, type ClaudeDistillerEvent } from './distiller'

type StubResponse = Partial<Anthropic.Message>

function makeStubClient(
  scripts:
    | StubResponse
    | StubResponse[]
    | ((attempt: number) => Promise<StubResponse> | StubResponse),
): {
  client: Pick<Anthropic, 'messages'>
  callLog: Anthropic.MessageCreateParams[]
  callCount: () => number
} {
  const callLog: Anthropic.MessageCreateParams[] = []
  let attempt = 0
  const client: Pick<Anthropic, 'messages'> = {
    messages: {
      create: (async (params: Anthropic.MessageCreateParams): Promise<Anthropic.Message> => {
        callLog.push(params)
        attempt++
        const response =
          typeof scripts === 'function'
            ? await scripts(attempt)
            : Array.isArray(scripts)
              ? scripts[Math.min(attempt - 1, scripts.length - 1)]
              : scripts
        if (response instanceof Error) throw response
        return fillDefaults(response as StubResponse) as Anthropic.Message
      }) as Anthropic['messages']['create'],
      // biome-ignore lint/suspicious/noExplicitAny: stub surface only needs `create`
    } as any,
  }
  return { client, callLog, callCount: () => attempt }
}

function fillDefaults(r: StubResponse): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: r.content ?? [],
    usage: r.usage ?? {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...r,
  } as Anthropic.Message
}

function toolUseBlock(memories: unknown): Anthropic.ToolUseBlock {
  return {
    type: 'tool_use',
    id: 'toolu_abc',
    name: 'record_memories',
    input: { memories },
  }
}

describe('ClaudeDistiller', () => {
  test('throws on missing apiKey when no client is stubbed', () => {
    expect(() => new ClaudeDistiller({ apiKey: '' })).toThrow(/apiKey/i)
  })

  test('rejects empty text input before calling Anthropic', async () => {
    const { client, callCount } = makeStubClient({
      content: [toolUseBlock([])],
    })
    const distiller = new ClaudeDistiller({ apiKey: 'sk-stub', client })
    await expect(distiller.distill({ text: '' })).rejects.toThrow(/non-empty/i)
    expect(callCount()).toBe(0)
  })

  test('parses a valid tool_use response into ExtractedMemory[]', async () => {
    const { client } = makeStubClient({
      content: [
        toolUseBlock([
          {
            kind: 'preference',
            body: 'Prefers single-origin coffee over blends',
            confidence: 0.95,
            sourceContext: 'I really prefer single-origin to blends',
          },
          { kind: 'event', body: 'Visited Brick Lane espresso bar', confidence: 0.88 },
        ]),
      ],
      usage: {
        input_tokens: 1234,
        output_tokens: 87,
        cache_read_input_tokens: 1100,
        cache_creation_input_tokens: 0,
      },
    })
    const distiller = new ClaudeDistiller({ apiKey: 'sk-stub', client })
    const output = await distiller.distill({ text: 'Some journal entry' })
    expect(output.extracted).toHaveLength(2)
    expect(output.extracted[0]?.kind).toBe('preference')
    expect(output.extracted[0]?.sourceContext).toBe('I really prefer single-origin to blends')
    expect(output.extracted[1]?.sourceContext).toBeUndefined()
    expect(output.usage.promptTokens).toBe(1234)
    expect(output.usage.completionTokens).toBe(87)
    // Cache discount on input means cost is meaningfully lower than uncached
    expect(output.usage.costUsdEstimate).toBeGreaterThan(0)
    expect(output.usage.costUsdEstimate).toBeLessThan(0.01)
  })

  test('aborts on schema-invalid tool_use input (bad kind, body too long, etc.)', async () => {
    const { client } = makeStubClient({
      content: [
        toolUseBlock([
          { kind: 'feeling', body: 'is happy', confidence: 0.8 }, // invalid kind
        ]),
      ],
    })
    const distiller = new ClaudeDistiller({ apiKey: 'sk-stub', client, maxRetries: 1 })
    await expect(distiller.distill({ text: 'some text' })).rejects.toThrow()
  })

  test('aborts when response has no tool_use block', async () => {
    const { client } = makeStubClient({
      content: [{ type: 'text', text: 'I will not call your tool today', citations: null }],
      stop_reason: 'end_turn',
    })
    const distiller = new ClaudeDistiller({ apiKey: 'sk-stub', client, maxRetries: 1 })
    await expect(distiller.distill({ text: 'some text' })).rejects.toThrow(/tool_use/i)
  })

  test('retries on 429 / 5xx errors with exponential backoff', async () => {
    let count = 0
    const { client } = makeStubClient(async (): Promise<StubResponse> => {
      count++
      if (count === 1) throw new Error('429 Too Many Requests')
      if (count === 2) throw new Error('502 Bad Gateway')
      return {
        content: [toolUseBlock([{ kind: 'fact', body: 'After retries', confidence: 0.9 }])],
      }
    })
    const events: ClaudeDistillerEvent[] = []
    const distiller = new ClaudeDistiller({
      apiKey: 'sk-stub',
      client,
      maxRetries: 4,
      onEvent: (e) => events.push(e),
    })
    const output = await distiller.distill({ text: 'will succeed on attempt 3' })
    expect(output.extracted).toHaveLength(1)
    expect(count).toBe(3)
    const retries = events.filter((e) => e.type === 'retry')
    expect(retries.length).toBe(2)
  })

  test('does NOT retry on non-retryable errors (4xx other than 429)', async () => {
    let count = 0
    const { client } = makeStubClient(async (): Promise<StubResponse> => {
      count++
      throw new Error('400 Bad Request')
    })
    const distiller = new ClaudeDistiller({ apiKey: 'sk-stub', client, maxRetries: 4 })
    await expect(distiller.distill({ text: 'doomed' })).rejects.toThrow(/400/)
    expect(count).toBe(1) // single attempt, no retry
  })

  test('aborts when estimated cost exceeds maxCostUsdPerCall', async () => {
    const { client } = makeStubClient({
      content: [toolUseBlock([{ kind: 'fact', body: 'expensive', confidence: 0.9 }])],
      usage: {
        input_tokens: 1_000_000, // 1M input @ $3/M = $3 just on input
        output_tokens: 1_000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    })
    const distiller = new ClaudeDistiller({
      apiKey: 'sk-stub',
      client,
      maxCostUsdPerCall: 1, // hard cap below the projected cost
      maxRetries: 1,
    })
    await expect(distiller.distill({ text: 'huge input' })).rejects.toThrow(/cost/i)
  })

  test('prompt caching ON by default — system content is sent with cache_control', async () => {
    const { client, callLog } = makeStubClient({
      content: [toolUseBlock([])],
    })
    const distiller = new ClaudeDistiller({ apiKey: 'sk-stub', client })
    await distiller.distill({ text: 'hello' })
    expect(callLog).toHaveLength(1)
    const params = callLog[0]
    // System should be a structured array with a cache_control on the text block
    expect(Array.isArray(params?.system)).toBe(true)
    // biome-ignore lint/suspicious/noExplicitAny: introspecting stub request shape
    const block = (params?.system as any[])[0]
    expect(block.cache_control).toEqual({ type: 'ephemeral' })
  })

  test('prompt caching OFF when disablePromptCaching: true', async () => {
    const { client, callLog } = makeStubClient({
      content: [toolUseBlock([])],
    })
    const distiller = new ClaudeDistiller({
      apiKey: 'sk-stub',
      client,
      disablePromptCaching: true,
    })
    await distiller.distill({ text: 'hello' })
    expect(typeof callLog[0]?.system).toBe('string')
  })

  test('emits request → response events on success', async () => {
    const { client } = makeStubClient({
      content: [toolUseBlock([{ kind: 'fact', body: 'a', confidence: 0.9 }])],
    })
    const events: ClaudeDistillerEvent[] = []
    const distiller = new ClaudeDistiller({
      apiKey: 'sk-stub',
      client,
      onEvent: (e) => events.push(e),
    })
    await distiller.distill({ text: 'hello' })
    const types = events.map((e) => e.type)
    expect(types).toEqual(['request', 'response'])
  })

  test('observability hook errors do not crash the distiller', async () => {
    const { client } = makeStubClient({
      content: [toolUseBlock([{ kind: 'fact', body: 'ok', confidence: 0.9 }])],
    })
    const distiller = new ClaudeDistiller({
      apiKey: 'sk-stub',
      client,
      onEvent: () => {
        throw new Error('observability is broken')
      },
    })
    const output = await distiller.distill({ text: 'hello' })
    expect(output.extracted).toHaveLength(1)
  })
})
