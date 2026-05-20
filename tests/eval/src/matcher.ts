import type { ExtractedMemory } from '@mnemehq/sdk'
import type { ExpectedMemory } from './types'

/**
 * Score an extracted vs expected pair. A match requires:
 *   - same `kind`
 *   - extracted body contains EVERY `mustInclude` substring (case-insensitive)
 *   - extracted body contains NONE of the `mustNotInclude` anti-patterns
 *
 * Synchronous, deterministic, free. Used directly by unit tests and as
 * the body of the keyword `Matcher`.
 */
export function isMatch(extracted: ExtractedMemory, expected: ExpectedMemory): boolean {
  if (extracted.kind !== expected.kind) return false
  const hay = extracted.body.toLowerCase()
  for (const needle of expected.mustInclude) {
    if (!hay.includes(needle.toLowerCase())) return false
  }
  for (const anti of expected.mustNotInclude ?? []) {
    if (hay.includes(anti.toLowerCase())) return false
  }
  return true
}

/**
 * Pluggable matcher strategy (ADR 0014). Two implementations ship:
 *
 *   - keywordMatcher — deterministic substring matching (used in CI)
 *   - JudgeMatcher (see ./judge.ts) — LLM-backed semantic equivalence
 *
 * Future extensions can drop in behind this interface without touching
 * the runner: embedding-similarity, OpenAI-backed judge, local-llama,
 * etc.
 */
export interface Matcher {
  readonly name: string
  match(extracted: ExtractedMemory, expected: ExpectedMemory): Promise<MatchResult>
}

export type MatchResult = {
  /** True if the matcher considers the two memories equivalent. */
  matched: boolean
  /** Optional human-readable explanation (used by the judge matcher). */
  reason?: string
  /** Optional confidence in 0..1 (used by the judge matcher). */
  confidence?: number
}

/**
 * The original ADR-0013 matcher, wrapped as a {@link Matcher}. Pure
 * synchronous logic under the hood (no I/O), so it's free to run on
 * every eval invocation.
 */
export const keywordMatcher: Matcher = {
  name: 'keyword',
  async match(extracted, expected) {
    return { matched: isMatch(extracted, expected) }
  },
}

/**
 * Greedy many-to-many assignment between extracted and expected memories
 * using the supplied {@link Matcher}.
 *
 * Walks expected[] in order; for each one finds the first unmatched
 * extracted that the matcher considers equivalent. Returns the index
 * sets that paired up plus the resulting TP / FP / FN counts.
 *
 * Greedy (not optimal) is the right choice for v0.1 — extractions are
 * usually unambiguous about which expected they satisfy, and the corpus
 * author can always disambiguate by tightening `mustInclude`. An optimal
 * bipartite matcher (Hungarian algorithm) would be more correct in
 * pathological cases but adds complexity that won't pay for itself
 * before the corpus grows past ~100 samples.
 */
export type AssignmentResult = {
  /** Indices into expected[] that found a match. */
  matchedExpected: number[]
  /** Indices into extracted[] that found a match. */
  matchedExtracted: number[]
  tp: number
  fp: number
  fn: number
}

export async function assign(
  extracted: ExtractedMemory[],
  expected: ExpectedMemory[],
  matcher: Matcher = keywordMatcher,
): Promise<AssignmentResult> {
  const usedExtracted = new Set<number>()
  const matchedExpected: number[] = []
  const matchedExtracted: number[] = []

  for (let e = 0; e < expected.length; e++) {
    const exp = expected[e]
    if (!exp) continue
    for (let x = 0; x < extracted.length; x++) {
      if (usedExtracted.has(x)) continue
      const ex = extracted[x]
      if (!ex) continue
      const result = await matcher.match(ex, exp)
      if (result.matched) {
        usedExtracted.add(x)
        matchedExpected.push(e)
        matchedExtracted.push(x)
        break
      }
    }
  }

  const tp = matchedExpected.length
  const fp = extracted.length - matchedExtracted.length
  const fn = expected.length - matchedExpected.length
  return { matchedExpected, matchedExtracted, tp, fp, fn }
}

/**
 * Compute precision, recall, F1 from raw counts. NaN-safe — returns 0
 * when the denominator is 0 (which is the IR-conventional choice for
 * "nothing to measure" rather than propagating NaN through the report).
 */
export function metrics(
  tp: number,
  fp: number,
  fn: number,
): { precision: number; recall: number; f1: number } {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1 }
}
