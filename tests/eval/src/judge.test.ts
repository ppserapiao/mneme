import { describe, expect, test } from 'bun:test'
import type Anthropic from '@anthropic-ai/sdk'
import type { ExtractedMemory } from '@mnemehq/sdk'
import { ClaudeJudgeMatcher, type JudgeEvent } from './judge'
import type { ExpectedMemory } from './types'

type StubResponse = Partial<Anthropic.Message>

function makeStubClient(
  scripts:
    | StubResponse
    | StubResponse[]
    | ((attempt: number) => Promise<StubResponse> | StubResponse),
): {
  client: Pick<Anthropic, 'messages'>
  callLog: Anthropic.MessageCreateParams[]
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
    } as unknown as Anthropic['messages'],
  }
  return { client, callLog }
}

function fillDefaults(r: StubResponse): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: r.content ?? [],
    usage: r.usage ?? {
      input_tokens: 200,
      output_tokens: 80,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...r,
  } as Anthropic.Message
}

function judgeBlock(matched: boolean, confidence: number, reason: string): Anthropic.ToolUseBlock {
  return {
    type: 'tool_use',
    id: 'toolu_judge',
    name: 'judge_match',
    input: { matched, reason, confidence },
  }
}

const ex = (kind: ExtractedMemory['kind'], body: string): ExtractedMemory => ({
  kind,
  body,
  confidence: 0.9,
})

const exp = (kind: ExpectedMemory['kind'], gist: string): ExpectedMemory => ({
  kind,
  gist,
  mustInclude: [],
})

describe('ClaudeJudgeMatcher', () => {
  test('returns matched=true when the model says match with high confidence', async () => {
    const { client } = makeStubClient({
      content: [judgeBlock(true, 0.95, 'Both about London residence')],
    })
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client })
    const result = await judge.match(
      ex('fact', 'Resides in London and works in product'),
      exp('fact', 'Lives in London'),
    )
    expect(result.matched).toBe(true)
    expect(result.confidence).toBe(0.95)
    expect(result.reason).toContain('London')
  })

  test('returns matched=false when the model says no-match', async () => {
    const { client } = makeStubClient({
      content: [judgeBlock(false, 0.9, 'Tea vs coffee — different preference')],
    })
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client })
    const result = await judge.match(
      ex('preference', 'Prefers tea'),
      exp('preference', 'Prefers coffee'),
    )
    expect(result.matched).toBe(false)
  })

  test('treats low-confidence matches as no-match (confidence floor 0.7 default)', async () => {
    const { client } = makeStubClient({
      content: [judgeBlock(true, 0.55, 'Ambiguous')],
    })
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client })
    const result = await judge.match(ex('fact', 'something'), exp('fact', 'thing'))
    expect(result.matched).toBe(false)
    expect(result.confidence).toBe(0.55)
  })

  test('honours a custom confidenceFloor', async () => {
    const { client } = makeStubClient({
      content: [judgeBlock(true, 0.55, 'Ambiguous but acceptable')],
    })
    const judge = new ClaudeJudgeMatcher({
      apiKey: 'sk-stub',
      client,
      confidenceFloor: 0.5,
    })
    const result = await judge.match(ex('fact', 'something'), exp('fact', 'thing'))
    expect(result.matched).toBe(true)
  })

  test('rejects on missing apiKey when no client is stubbed', () => {
    expect(() => new ClaudeJudgeMatcher({ apiKey: '' })).toThrow(/apiKey/i)
  })

  test('aborts when response has no tool_use block', async () => {
    const { client } = makeStubClient({
      content: [{ type: 'text', text: 'I refuse the tool', citations: null }],
      stop_reason: 'end_turn',
    })
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client, maxRetries: 1 })
    await expect(judge.match(ex('fact', 'x'), exp('fact', 'y'))).rejects.toThrow(/tool_use/i)
  })

  test('aborts on schema-invalid tool input (confidence > 1)', async () => {
    const { client } = makeStubClient({
      content: [judgeBlock(true, 1.5, 'invalid confidence')],
    })
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client, maxRetries: 1 })
    await expect(judge.match(ex('fact', 'x'), exp('fact', 'y'))).rejects.toThrow()
  })

  test('retries on 429/5xx with exponential backoff, then succeeds', async () => {
    let count = 0
    const { client } = makeStubClient(async (): Promise<StubResponse> => {
      count++
      if (count === 1) throw new Error('429 Too Many Requests')
      if (count === 2) throw new Error('503 Service Unavailable')
      return { content: [judgeBlock(true, 0.9, 'after retries')] }
    })
    const events: JudgeEvent[] = []
    const judge = new ClaudeJudgeMatcher({
      apiKey: 'sk-stub',
      client,
      maxRetries: 4,
      onEvent: (e) => events.push(e),
    })
    const result = await judge.match(ex('fact', 'a'), exp('fact', 'b'))
    expect(result.matched).toBe(true)
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
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client, maxRetries: 4 })
    await expect(judge.match(ex('fact', 'x'), exp('fact', 'y'))).rejects.toThrow(/400/)
    expect(count).toBe(1)
  })

  test('tracks cumulative cost across calls (cache-warm gets the discounted rate)', async () => {
    let cacheState: 'cold' | 'warm' = 'cold'
    const { client } = makeStubClient(async (): Promise<StubResponse> => {
      const cache_read = cacheState === 'cold' ? 0 : 1000
      const cache_create = cacheState === 'cold' ? 1000 : 0
      cacheState = 'warm'
      return {
        content: [judgeBlock(true, 0.9, 'ok')],
        usage: {
          input_tokens: 1200,
          output_tokens: 80,
          cache_read_input_tokens: cache_read,
          cache_creation_input_tokens: cache_create,
        },
      }
    })
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client })
    await judge.match(ex('fact', 'a'), exp('fact', 'b'))
    const afterFirst = judge.totalCostUsdEstimate
    await judge.match(ex('fact', 'c'), exp('fact', 'd'))
    const afterSecond = judge.totalCostUsdEstimate
    // Second call (cache-warm) should add less cost than the first (cache-cold)
    expect(afterSecond - afterFirst).toBeLessThan(afterFirst)
  })

  test('system prompt is sent with cache_control by default', async () => {
    const { client, callLog } = makeStubClient({
      content: [judgeBlock(true, 0.9, 'ok')],
    })
    const judge = new ClaudeJudgeMatcher({ apiKey: 'sk-stub', client })
    await judge.match(ex('fact', 'x'), exp('fact', 'y'))
    expect(callLog).toHaveLength(1)
    const sys = callLog[0]?.system
    expect(Array.isArray(sys)).toBe(true)
    const block = (sys as Array<{ cache_control?: unknown }>)[0]
    expect(block?.cache_control).toEqual({ type: 'ephemeral' })
  })

  test('observability hook errors do not crash the matcher', async () => {
    const { client } = makeStubClient({
      content: [judgeBlock(true, 0.9, 'ok')],
    })
    const judge = new ClaudeJudgeMatcher({
      apiKey: 'sk-stub',
      client,
      onEvent: () => {
        throw new Error('hook broken')
      },
    })
    const result = await judge.match(ex('fact', 'x'), exp('fact', 'y'))
    expect(result.matched).toBe(true)
  })

  test('reports a stable .name including the model', async () => {
    const judge = new ClaudeJudgeMatcher({
      apiKey: 'sk-stub',
      client: makeStubClient({ content: [judgeBlock(true, 0.9, 'ok')] }).client,
      model: 'claude-haiku-4-5',
    })
    expect(judge.name).toBe('judge-claude:claude-haiku-4-5')
    expect(judge.model).toBe('claude-haiku-4-5')
  })
})
