/**
 * Pluggable embedding provider. v0.0.1 of the SDK does not ship a default
 * implementation — semantic search runs through SQLite FTS5 lexical search.
 *
 * Future packages:
 *   - `@mnemehq/embedder-local` — on-device ONNX models via transformers.js
 *   - `@mnemehq/embedder-voyage` — Voyage AI hosted embeddings
 *
 * All embedders MUST return unit-norm vectors so cosine similarity reduces to
 * a dot product.
 */
export interface Embedder {
  readonly dimensions: number
  embed(text: string): Promise<Float32Array>
}
