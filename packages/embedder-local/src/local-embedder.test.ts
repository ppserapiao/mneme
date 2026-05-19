import { describe, expect, test } from 'bun:test'
import { LocalEmbedder } from './index'

describe('LocalEmbedder — shape', () => {
  test('defaults to Xenova/all-MiniLM-L6-v2 at 384 dimensions', () => {
    const embedder = new LocalEmbedder()
    expect(embedder.dimensions).toBe(384)
  })

  test('accepts an explicit model and dimension count', () => {
    const embedder = new LocalEmbedder({ model: 'custom/model', dimensions: 768 })
    expect(embedder.dimensions).toBe(768)
  })
})

/**
 * Integration tests load the real model. They pass under Bun (and Node), but
 * Bun 1.3.x has a known cleanup-time crash with onnxruntime-node's native
 * addon — see https://github.com/oven-sh/bun/issues for details. Until that
 * settles we keep these gated behind an env flag so CI stays green by default.
 *
 * Run locally with: `MNEME_RUN_INTEGRATION=1 bun test packages/embedder-local`
 */
const integration = process.env['MNEME_RUN_INTEGRATION'] === '1' ? test : test.skip

describe('LocalEmbedder — integration with @huggingface/transformers', () => {
  integration(
    'embeds text into a unit-norm 384-dim vector via the default model',
    async () => {
      const embedder = new LocalEmbedder()
      const vec = await embedder.embed('Pedro prefers concise code review comments')
      expect(vec).toBeInstanceOf(Float32Array)
      expect(vec.length).toBe(embedder.dimensions)
      // L2 norm should be ~1 after `normalize: true`. Allow modest floating-point drift.
      let sumSquares = 0
      for (let i = 0; i < vec.length; i++) {
        sumSquares += (vec[i] as number) ** 2
      }
      const norm = Math.sqrt(sumSquares)
      expect(norm).toBeGreaterThan(0.99)
      expect(norm).toBeLessThan(1.01)
    },
    120_000,
  )

  integration(
    'similar texts produce more-similar vectors than unrelated ones',
    async () => {
      const embedder = new LocalEmbedder()
      const a = await embedder.embed('Loves drinking coffee in the morning')
      const b = await embedder.embed('Enjoys a hot espresso before work')
      const c = await embedder.embed('Plays the violin in a string quartet')

      const sim = (x: Float32Array, y: Float32Array): number => {
        let dot = 0
        for (let i = 0; i < x.length; i++) dot += (x[i] as number) * (y[i] as number)
        return dot
      }

      const ab = sim(a, b)
      const ac = sim(a, c)
      // The coffee/espresso pair should be more semantically similar than
      // coffee/violin. This is the load-bearing property of the model.
      expect(ab).toBeGreaterThan(ac)
    },
    120_000,
  )
})
