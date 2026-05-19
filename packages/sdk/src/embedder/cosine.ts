/**
 * Cosine similarity for two vectors of equal length.
 *
 * Returns a value in [-1, 1] where 1 is identical direction. If either vector
 * is the zero vector the result is 0 (rather than NaN) so it sorts cleanly
 * alongside real similarities.
 *
 * Inputs are expected to be unit-normalised by the embedder; we still divide
 * by magnitudes here as a defence against drift.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`)
  }
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] as number
    const bi = b[i] as number
    dot += ai * bi
    magA += ai * ai
    magB += bi * bi
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}
