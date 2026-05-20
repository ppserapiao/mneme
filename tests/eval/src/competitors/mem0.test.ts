import { describe, expect, test } from 'bun:test'
import type { Memory as Mem0Memory, MemoryItem, SearchResult } from 'mem0ai/oss'
import { MEM0_TARGET_VERSION, Mem0Distiller } from './mem0'

type AddCall = { messages: unknown; options: unknown }
type GetAllCall = { options: unknown }

function makeStubMemory(stored: MemoryItem[][]): {
  memory: Mem0Memory
  addCalls: AddCall[]
  getAllCalls: GetAllCall[]
} {
  const addCalls: AddCall[] = []
  const getAllCalls: GetAllCall[] = []
  let callIndex = 0
  const memory = {
    async add(messages: unknown, options: unknown): Promise<SearchResult> {
      addCalls.push({ messages, options })
      return { results: [] }
    },
    async getAll(options: unknown): Promise<SearchResult> {
      getAllCalls.push({ options })
      const slot = stored[Math.min(callIndex, stored.length - 1)] ?? []
      callIndex++
      return { results: slot }
    },
  } as unknown as Mem0Memory
  return { memory, addCalls, getAllCalls }
}

const mem = (id: string, body: string): MemoryItem => ({ id, memory: body })

describe('Mem0Distiller', () => {
  test('requires anthropicApiKey when no memory is supplied', () => {
    expect(() => new Mem0Distiller({})).toThrow(/anthropicApiKey/)
  })

  test('requires openaiApiKey when no memory is supplied', () => {
    expect(() => new Mem0Distiller({ anthropicApiKey: 'sk-ant-stub' })).toThrow(/openaiApiKey/)
  })

  test('uses the supplied memory and bypasses API key checks', () => {
    const { memory } = makeStubMemory([])
    const d = new Mem0Distiller({ memory })
    expect(d.name).toBe('mem0-distiller')
    expect(d.model).toContain('claude-sonnet-4-6')
    expect(d.model).toContain('text-embedding-3-small')
    expect(d.promptVersion).toBe(`mem0-v${MEM0_TARGET_VERSION}`)
  })

  test('model identifier reflects custom llmModel and embedderModel', () => {
    const { memory } = makeStubMemory([])
    const d = new Mem0Distiller({
      memory,
      llmModel: 'claude-haiku-4-5',
      embedderModel: 'text-embedding-3-large',
    })
    expect(d.model).toBe('claude-haiku-4-5+text-embedding-3-large')
  })

  test('distill: calls memory.add with the input text and a unique user_id', async () => {
    const { memory, addCalls, getAllCalls } = makeStubMemory([
      [mem('a', 'Lives in London'), mem('b', 'Prefers single-origin coffee')],
    ])
    const d = new Mem0Distiller({ memory })
    const out = await d.distill({ text: 'I live in London and love single-origin coffee.' })

    expect(addCalls).toHaveLength(1)
    const add = addCalls[0]
    expect(Array.isArray(add?.messages)).toBe(true)
    const opts = add?.options as { userId: string; infer: boolean }
    expect(typeof opts.userId).toBe('string')
    expect(opts.userId.length).toBeGreaterThan(10) // UUID-shaped
    expect(opts.infer).toBe(true)

    expect(getAllCalls).toHaveLength(1)
    const getOpts = getAllCalls[0]?.options as { filters: { user_id: string } }
    expect(getOpts.filters.user_id).toBe(opts.userId)

    expect(out.extracted).toHaveLength(2)
    expect(out.extracted[0]?.kind).toBe('fact')
    expect(out.extracted[0]?.body).toBe('Lives in London')
    expect(out.extracted[1]?.kind).toBe('fact')
    expect(out.extracted[1]?.body).toBe('Prefers single-origin coffee')
    expect(out.usage.costUsdEstimate).toBe(0) // ADR 0015 §5: not auto-tracked
  })

  test('each distill call generates a fresh user_id (per-sample isolation)', async () => {
    const { memory, addCalls } = makeStubMemory([[], []])
    const d = new Mem0Distiller({ memory })
    await d.distill({ text: 'sample A' })
    await d.distill({ text: 'sample B' })
    const u1 = (addCalls[0]?.options as { userId: string }).userId
    const u2 = (addCalls[1]?.options as { userId: string }).userId
    expect(u1).not.toBe(u2)
  })

  test('all extracted memories receive kind="fact" (ADR 0015 §4 default-fact mapping)', async () => {
    const { memory } = makeStubMemory([
      [
        mem('1', 'Lives in London'),
        mem('2', 'Prefers single-origin coffee'),
        mem('3', 'Allergic to peanuts'),
        mem('4', 'Working on the platform launch'),
      ],
    ])
    const d = new Mem0Distiller({ memory })
    const out = await d.distill({ text: 'multi-fact input' })
    for (const m of out.extracted) {
      expect(m.kind).toBe('fact')
    }
  })

  test('observability hook fires sample-start and sample-end on success', async () => {
    const { memory } = makeStubMemory([[mem('1', 'a fact')]])
    const events: Array<{ type: string }> = []
    const d = new Mem0Distiller({
      memory,
      onEvent: (e) => events.push({ type: e.type }),
    })
    await d.distill({ text: 'input' })
    expect(events.map((e) => e.type)).toEqual(['sample-start', 'sample-end'])
  })

  test('observability hook fires sample-error and rethrows on failure', async () => {
    const memory = {
      async add(): Promise<never> {
        throw new Error('mem0 upstream broke')
      },
      async getAll(): Promise<never> {
        throw new Error('unreachable')
      },
    } as unknown as Mem0Memory
    const events: Array<{ type: string }> = []
    const d = new Mem0Distiller({ memory, onEvent: (e) => events.push({ type: e.type }) })
    let caught: Error | undefined
    try {
      await d.distill({ text: 'will fail' })
    } catch (e) {
      caught = e as Error
    }
    expect(caught?.message).toContain('mem0 upstream broke')
    expect(events.map((e) => e.type)).toEqual(['sample-start', 'sample-error'])
  })

  test('returns empty extraction when Mem0 stored nothing (edge-cases path)', async () => {
    const { memory } = makeStubMemory([[]])
    const d = new Mem0Distiller({ memory })
    const out = await d.distill({ text: 'nothing memorable' })
    expect(out.extracted).toHaveLength(0)
  })
})
