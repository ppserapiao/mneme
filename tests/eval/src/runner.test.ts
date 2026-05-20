import { describe, expect, test } from 'bun:test'
import type { DistillInput, DistillOutput, Distiller, ExtractedMemory } from '@mnemehq/sdk'
import { runEval } from './runner'
import type { CorpusSample } from './types'

function scriptedDistiller(
  extractedByInput: Record<string, ExtractedMemory[]>,
  costPerCall = 0.001,
): Distiller & { callCount(): number } {
  let calls = 0
  return {
    name: 'scripted',
    model: 'scripted-v1',
    async distill(input: DistillInput): Promise<DistillOutput> {
      calls++
      return {
        extracted: extractedByInput[input.text] ?? [],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          costUsdEstimate: costPerCall,
        },
        model: 'scripted-v1',
      }
    },
    callCount: () => calls,
  }
}

function corpus(samples: Array<Partial<CorpusSample> & { input: string }>): CorpusSample[] {
  return samples.map((s, i) => ({
    id: s.id ?? `t-${i + 1}`,
    category: s.category ?? 'test',
    input: s.input,
    expected: s.expected ?? [],
    ...(s.notes ? { notes: s.notes } : {}),
  }))
}

describe('runEval — aggregate metrics', () => {
  test('counts TP / FP / FN correctly across the corpus', async () => {
    const c = corpus([
      {
        input: 'A',
        expected: [{ kind: 'fact', gist: 'lives in London', mustInclude: ['London'] }],
      },
      {
        input: 'B',
        expected: [{ kind: 'preference', gist: 'likes coffee', mustInclude: ['coffee'] }],
      },
    ])
    const distiller = scriptedDistiller({
      A: [{ kind: 'fact', body: 'Lives in London', confidence: 0.9 }],
      B: [], // miss — expected fact won't be matched, gets FN
    })

    const report = await runEval({ corpus: c, distiller, concurrency: 1 })
    expect(report.overall.tp).toBe(1)
    expect(report.overall.fp).toBe(0)
    expect(report.overall.fn).toBe(1)
    expect(report.overall.precision).toBeCloseTo(1, 5)
    expect(report.overall.recall).toBeCloseTo(0.5, 5)
    expect(report.overall.f1).toBeCloseTo(0.6667, 4)
    expect(report.overall.expectedTotal).toBe(2)
    expect(report.overall.extractedTotal).toBe(1)
  })

  test('breaks down metrics by category', async () => {
    const c = corpus([
      {
        category: 'cat-A',
        input: '1',
        expected: [{ kind: 'fact', gist: '', mustInclude: ['foo'] }],
      },
      {
        category: 'cat-B',
        input: '2',
        expected: [{ kind: 'fact', gist: '', mustInclude: ['bar'] }],
      },
    ])
    const distiller = scriptedDistiller({
      '1': [{ kind: 'fact', body: 'foo lives here', confidence: 0.9 }],
      '2': [], // miss
    })

    const report = await runEval({ corpus: c, distiller, concurrency: 1 })
    expect(report.byCategory['cat-A']?.precision).toBeCloseTo(1, 5)
    expect(report.byCategory['cat-A']?.recall).toBeCloseTo(1, 5)
    expect(report.byCategory['cat-B']?.recall).toBe(0)
    expect(report.byCategory['cat-B']?.fn).toBe(1)
  })
})

describe('runEval — failure isolation', () => {
  test('a sample-level distill failure does NOT abort the run', async () => {
    const c = corpus([
      { input: 'A', expected: [{ kind: 'fact', gist: '', mustInclude: ['x'] }] },
      { input: 'B', expected: [{ kind: 'fact', gist: '', mustInclude: ['y'] }] },
      { input: 'C', expected: [{ kind: 'fact', gist: '', mustInclude: ['z'] }] },
    ])
    const distiller: Distiller = {
      name: 'failing',
      model: 'failing-v1',
      async distill(input: DistillInput): Promise<DistillOutput> {
        if (input.text === 'B') throw new Error('upstream broke')
        return {
          extracted: [{ kind: 'fact', body: input.text, confidence: 0.9 }],
          usage: { promptTokens: 10, completionTokens: 5, costUsdEstimate: 0.0001 },
          model: 'failing-v1',
        }
      },
    }
    const report = await runEval({ corpus: c, distiller, concurrency: 1 })
    expect(report.samples).toHaveLength(3)
    expect(report.samples[0]?.tp).toBe(0) // body 'A' doesn't contain 'x' — keyword mismatch
    expect(report.samples[1]?.error).toContain('upstream broke')
    expect(report.samples[2]?.tp).toBe(0)
    // The whole run still completed
    expect(report.overall.sampleCount).toBe(3)
  })
})

describe('runEval — cost budget', () => {
  test('aborts further samples once cumulative cost exceeds maxCostUsd', async () => {
    const c = corpus([
      { input: '1', expected: [] },
      { input: '2', expected: [] },
      { input: '3', expected: [] },
      { input: '4', expected: [] },
    ])
    const distiller = scriptedDistiller(
      { '1': [], '2': [], '3': [], '4': [] },
      0.4, // $0.40 per call
    )
    const report = await runEval({
      corpus: c,
      distiller,
      concurrency: 1,
      maxCostUsd: 0.5, // first call $0.40, second would push past 0.5
    })
    // First two complete, the next is skipped with an error
    expect(report.samples[0]?.error).toBeUndefined()
    expect(report.samples[1]?.error).toBeUndefined()
    expect(report.samples[2]?.error).toContain('budget')
    expect(report.samples[3]?.error).toContain('budget')
    expect(report.totalCostUsdEstimate).toBeCloseTo(0.8, 5) // two calls completed
  })
})

describe('runEval — observability', () => {
  test('onSampleComplete fires once per sample with the index and total', async () => {
    const c = corpus([
      { input: 'A', expected: [] },
      { input: 'B', expected: [] },
    ])
    const distiller = scriptedDistiller({ A: [], B: [] })
    const completions: Array<{ index: number; total: number; sampleId: string }> = []
    await runEval({
      corpus: c,
      distiller,
      concurrency: 1,
      onSampleComplete: (r, i, total) =>
        completions.push({ index: i, total, sampleId: r.sampleId }),
    })
    expect(completions).toHaveLength(2)
    expect(completions[0]?.total).toBe(2)
    expect(completions[1]?.total).toBe(2)
  })
})

describe('runEval — invariant guards', () => {
  test('throws on empty corpus', async () => {
    const distiller = scriptedDistiller({})
    await expect(runEval({ corpus: [], distiller })).rejects.toThrow(/empty/i)
  })

  test('throws on concurrency < 1', async () => {
    const c = corpus([{ input: 'A', expected: [] }])
    const distiller = scriptedDistiller({ A: [] })
    await expect(runEval({ corpus: c, distiller, concurrency: 0 })).rejects.toThrow(/concurrency/)
  })
})
