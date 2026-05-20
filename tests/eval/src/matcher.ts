import type { ExtractedMemory } from '@mnemehq/sdk'
import type { ExpectedMemory } from './types'

/**
 * Score an extracted vs expected pair. A match requires:
 *   - same `kind`
 *   - extracted body contains EVERY `mustInclude` substring (case-insensitive)
 *   - extracted body contains NONE of the `mustNotInclude` anti-patterns
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
 * Greedy many-to-many assignment between extracted and expected memories.
 *
 * Walks expected[] in order; for each one finds the first unmatched extracted
 * that satisfies `isMatch`. Returns the index sets that paired up plus the
 * resulting TP / FP / FN counts.
 *
 * Greedy (not optimal) is the right choice here: extractions are usually
 * unambiguous about which expected they satisfy, and the corpus author can
 * always disambiguate by tightening `mustInclude`. An optimal bipartite
 * matcher (Hungarian algorithm) would be more correct in pathological cases
 * but adds complexity that won't pay for itself before the LLM-as-judge
 * upgrade in ADR 0013 §forward-path.
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

export function assign(extracted: ExtractedMemory[], expected: ExpectedMemory[]): AssignmentResult {
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
      if (isMatch(ex, exp)) {
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
 * Compute precision, recall, F1 from raw counts. NaN-safe — returns 0 when
 * the denominator is 0 (which is the IR-conventional choice for "nothing
 * to measure" rather than propagating NaN through the report).
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
