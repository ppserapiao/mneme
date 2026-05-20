import { afterEach, describe, expect, test } from 'bun:test'
import type { DistillInput, DistillOutput, Distiller, ExtractedMemory } from './distiller/types'
import { Mneme } from './index'
import type { Clock } from './util/clock'

function frozenClock(iso: string): Clock {
  return { now: () => new Date(iso) }
}

/**
 * Test double: returns a scripted set of extracted memories regardless of
 * input. Records calls so tests can assert what the SDK forwarded.
 */
function mockDistiller(extracted: ExtractedMemory[]): Distiller & {
  calls: DistillInput[]
} {
  const calls: DistillInput[] = []
  return {
    name: 'mock-distiller',
    model: 'mock-model-v1',
    calls,
    async distill(input: DistillInput): Promise<DistillOutput> {
      calls.push(input)
      return {
        extracted,
        usage: { promptTokens: 42, completionTokens: 17, costUsdEstimate: 0.0001 },
        model: 'mock-model-v1',
      }
    },
  }
}

describe('Mneme.distill', () => {
  let mneme: Mneme

  afterEach(() => {
    mneme.close()
  })

  test('throws invalid_record when no distiller is configured', async () => {
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'pedro',
      clock: frozenClock('2026-05-20T10:00:00.000Z'),
    })
    await expect(mneme.distill('some text')).rejects.toThrow(/distiller/i)
  })

  test('throws invalid_record on empty text', async () => {
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'pedro',
      distiller: mockDistiller([]),
      clock: frozenClock('2026-05-20T10:00:00.000Z'),
    })
    await expect(mneme.distill('')).rejects.toThrow(/non-empty/i)
    await expect(mneme.distill('   ')).rejects.toThrow(/non-empty/i)
  })

  test('persists each extracted memory via remember()', async () => {
    const distiller = mockDistiller([
      {
        kind: 'preference',
        body: 'Prefers single-origin coffee over blends',
        confidence: 0.9,
        sourceContext: 'Reminded me I prefer single-origin to blends.',
      },
      {
        kind: 'event',
        body: 'Visited the new espresso bar on Brick Lane',
        confidence: 0.85,
      },
    ])
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'pedro',
      distiller,
      clock: frozenClock('2026-05-20T10:00:00.000Z'),
    })

    const result = await mneme.distill('Some journal entry text')

    expect(result.written).toHaveLength(2)
    expect(result.skipped).toBe(0)
    expect(result.model).toBe('mock-model-v1')
    expect(result.usage.promptTokens).toBe(42)

    expect(result.written[0]?.kind).toBe('preference')
    expect(result.written[0]?.body).toEqual({
      mode: 'plaintext',
      data: 'Prefers single-origin coffee over blends',
    })
    expect(result.written[0]?.metadata?.sourceContext).toBe(
      'Reminded me I prefer single-origin to blends.',
    )
    expect(result.written[0]?.metadata?.confidence).toBe(0.9)

    expect(result.written[1]?.kind).toBe('event')
    // No sourceContext set on the second one → metadata.sourceContext is undefined
    expect(result.written[1]?.metadata?.sourceContext).toBeUndefined()
  })

  test('skips extracted memories below minConfidence', async () => {
    const distiller = mockDistiller([
      { kind: 'fact', body: 'High confidence fact', confidence: 0.95 },
      { kind: 'fact', body: 'Low confidence fact', confidence: 0.3 },
      { kind: 'fact', body: 'Edge case at threshold', confidence: 0.5 },
    ])
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'pedro',
      distiller,
      clock: frozenClock('2026-05-20T10:00:00.000Z'),
    })

    const result = await mneme.distill('input text', { minConfidence: 0.5 })

    // 0.95 passes, 0.5 passes (>= 0.5), 0.3 skips
    expect(result.written).toHaveLength(2)
    expect(result.skipped).toBe(1)
  })

  test('tags every written record with sourceApp when provided', async () => {
    const distiller = mockDistiller([
      { kind: 'preference', body: 'a', confidence: 0.9 },
      { kind: 'preference', body: 'b', confidence: 0.9 },
    ])
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'pedro',
      distiller,
      clock: frozenClock('2026-05-20T10:00:00.000Z'),
    })

    const result = await mneme.distill('input', { sourceApp: 'claude-code' })
    for (const r of result.written) expect(r.metadata?.sourceApp).toBe('claude-code')
  })

  test('passes hint through to the distiller adapter', async () => {
    const distiller = mockDistiller([])
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'pedro',
      distiller,
      clock: frozenClock('2026-05-20T10:00:00.000Z'),
    })

    await mneme.distill('input', {
      hint: { speakerLabel: 'pedro', maxMemories: 5, sourceApp: 'claude-code' },
    })

    expect(distiller.calls).toHaveLength(1)
    expect(distiller.calls[0]?.hint).toEqual({
      speakerLabel: 'pedro',
      maxMemories: 5,
      sourceApp: 'claude-code',
    })
  })

  test('propagates adapter errors unchanged', async () => {
    const distiller: Distiller = {
      name: 'broken',
      model: 'broken-v1',
      async distill(): Promise<DistillOutput> {
        throw new Error('upstream went pop')
      },
    }
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'pedro',
      distiller,
      clock: frozenClock('2026-05-20T10:00:00.000Z'),
    })
    await expect(mneme.distill('text')).rejects.toThrow('upstream went pop')
  })
})
