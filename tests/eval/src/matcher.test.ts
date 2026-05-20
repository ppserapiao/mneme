import { describe, expect, test } from 'bun:test'
import type { ExtractedMemory } from '@mnemehq/sdk'
import { assign, isMatch, metrics } from './matcher'
import type { ExpectedMemory } from './types'

const ex = (kind: ExtractedMemory['kind'], body: string): ExtractedMemory => ({
  kind,
  body,
  confidence: 0.9,
})

const exp = (
  kind: ExpectedMemory['kind'],
  gist: string,
  mustInclude: string[],
  mustNotInclude: string[] = [],
): ExpectedMemory => ({ kind, gist, mustInclude, mustNotInclude })

describe('isMatch', () => {
  test('matches when kind aligns and all mustInclude substrings present (case-insensitive)', () => {
    expect(
      isMatch(
        ex('preference', 'Prefers Single-Origin coffee over blends'),
        exp('preference', '...', ['single-origin', 'coffee']),
      ),
    ).toBe(true)
  })

  test('fails when kind differs', () => {
    expect(isMatch(ex('fact', 'Lives in London'), exp('preference', '...', ['London']))).toBe(false)
  })

  test('fails when a mustInclude keyword is missing', () => {
    expect(
      isMatch(
        ex('preference', 'Prefers single-origin coffee'),
        exp('preference', '...', ['single-origin', 'Brazilian']),
      ),
    ).toBe(false)
  })

  test('fails when a mustNotInclude anti-pattern is present', () => {
    expect(
      isMatch(
        ex('relationship', 'Sarah works in marketing'),
        exp('relationship', '...', ['Sarah'], ['Pedro']),
      ),
    ).toBe(true)
    expect(
      isMatch(
        ex('relationship', 'Sarah and Pedro work together in marketing'),
        exp('relationship', '...', ['Sarah'], ['Pedro']),
      ),
    ).toBe(false)
  })
})

describe('assign — greedy many-to-many assignment (keyword matcher)', () => {
  test('all-match — every expected matches some extracted, no extras', async () => {
    const extracted = [
      ex('preference', 'Prefers single-origin coffee'),
      ex('fact', 'Lives in London'),
    ]
    const expected = [exp('preference', '...', ['single-origin']), exp('fact', '...', ['London'])]
    const r = await assign(extracted, expected)
    expect(r.tp).toBe(2)
    expect(r.fp).toBe(0)
    expect(r.fn).toBe(0)
    expect(r.matchedExpected).toEqual([0, 1])
    expect(r.matchedExtracted).toEqual([0, 1])
  })

  test('under-extraction — fewer extracted than expected gives FN', async () => {
    const extracted = [ex('fact', 'Lives in London')]
    const expected = [exp('fact', '...', ['London']), exp('preference', '...', ['coffee'])]
    const r = await assign(extracted, expected)
    expect(r.tp).toBe(1)
    expect(r.fp).toBe(0)
    expect(r.fn).toBe(1)
  })

  test('over-extraction — extra extracted memories with no expected counterpart give FP', async () => {
    const extracted = [
      ex('fact', 'Lives in London'),
      ex('preference', 'Likes off-piste skiing'),
      ex('event', 'Visited the pub'),
    ]
    const expected = [exp('fact', '...', ['London'])]
    const r = await assign(extracted, expected)
    expect(r.tp).toBe(1)
    expect(r.fp).toBe(2)
    expect(r.fn).toBe(0)
  })

  test('one extracted is consumed by at most one expected (no double-counting)', async () => {
    // Two expected entries that COULD both match the same extracted memory.
    // Greedy assignment claims the first; the second falls through to FN.
    const extracted = [ex('fact', 'Lives in central London and works there')]
    const expected = [
      exp('fact', 'lives in London', ['London']),
      exp('fact', 'works in central area', ['works']),
    ]
    const r = await assign(extracted, expected)
    expect(r.tp).toBe(1)
    expect(r.fn).toBe(1)
    // The extracted memory accounted for one expected; not double-counted into FP
    expect(r.fp).toBe(0)
  })

  test('empty corpus on both sides — clean zero result', async () => {
    const r = await assign([], [])
    expect(r.tp).toBe(0)
    expect(r.fp).toBe(0)
    expect(r.fn).toBe(0)
  })

  test('mustNotInclude correctly rejects misattributed extractions', async () => {
    // The corpus expects a relationship memory about Tom that does NOT
    // claim something about Pedro. If the distiller fuses them, we want FN.
    const extracted = [ex('relationship', 'Tom and Pedro are close colleagues')]
    const expected = [exp('relationship', 'Tom is a contact', ['Tom'], ['Pedro'])]
    const r = await assign(extracted, expected)
    expect(r.tp).toBe(0)
    expect(r.fp).toBe(1) // extracted didn't match → FP
    expect(r.fn).toBe(1) // expected wasn't satisfied → FN
  })

  test('accepts a custom Matcher and uses its decisions', async () => {
    // A matcher that says yes to everything regardless of content. Useful
    // for testing the assignment loop independently of any specific matcher.
    const yesMatcher = {
      name: 'yes',
      async match() {
        return { matched: true }
      },
    }
    const r = await assign(
      [ex('fact', 'anything'), ex('fact', 'else')],
      [exp('preference', '...', ['mismatch'])],
      yesMatcher,
    )
    // First expected matches the first extracted; the second extracted
    // becomes FP since there's no other expected to claim it.
    expect(r.tp).toBe(1)
    expect(r.fp).toBe(1)
    expect(r.fn).toBe(0)
  })
})

describe('metrics', () => {
  test('precision/recall/f1 for a typical mid-quality run', () => {
    const m = metrics(7, 3, 2) // 7 tp, 3 fp, 2 fn
    expect(m.precision).toBeCloseTo(0.7, 5)
    expect(m.recall).toBeCloseTo(0.7778, 4)
    expect(m.f1).toBeCloseTo(0.7368, 4)
  })

  test('NaN-safe — zero denominators return 0, not NaN', () => {
    const empty = metrics(0, 0, 0)
    expect(empty.precision).toBe(0)
    expect(empty.recall).toBe(0)
    expect(empty.f1).toBe(0)
  })

  test('perfect run — 1.0 everywhere', () => {
    const m = metrics(10, 0, 0)
    expect(m.precision).toBe(1)
    expect(m.recall).toBe(1)
    expect(m.f1).toBe(1)
  })

  test('all-wrong run — precision 0, recall 0, F1 0', () => {
    const m = metrics(0, 5, 5)
    expect(m.precision).toBe(0)
    expect(m.recall).toBe(0)
    expect(m.f1).toBe(0)
  })
})
