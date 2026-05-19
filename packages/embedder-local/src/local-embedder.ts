import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers'
import type { Embedder } from '@mneme/sdk'

export type LocalEmbedderOptions = {
  /**
   * Hugging Face model identifier. Must be a feature-extraction model with
   * mean-pooling outputs (sentence-transformers style).
   *
   * Defaults to `Xenova/all-MiniLM-L6-v2` — 384-dim, ~25 MB, MIT-licensed.
   * The model is downloaded once on first call and cached by
   * `@huggingface/transformers` for subsequent runs.
   */
  model?: string

  /**
   * Output vector dimensionality. Must match the chosen model. Defaults to
   * 384 (correct for `all-MiniLM-L6-v2`).
   */
  dimensions?: number
}

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'
const DEFAULT_DIMENSIONS = 384

/**
 * On-device embedder backed by `@huggingface/transformers`. Implements the
 * `Embedder` interface from `@mneme/sdk` so it slots into `new Mneme({ embedder })`
 * without further wiring.
 *
 * The model is lazily loaded on the first `embed()` call and reused for the
 * lifetime of the instance. Concurrent calls during initial load share the
 * same load promise, so the model is downloaded exactly once.
 *
 * Output vectors are mean-pooled and L2-normalised, so cosine similarity in
 * the SDK is just a dot product.
 */
export class LocalEmbedder implements Embedder {
  readonly dimensions: number
  private readonly modelName: string
  private pipe: FeatureExtractionPipeline | null = null
  private loading: Promise<FeatureExtractionPipeline> | null = null

  constructor(options: LocalEmbedderOptions = {}) {
    this.modelName = options.model ?? DEFAULT_MODEL
    this.dimensions = options.dimensions ?? DEFAULT_DIMENSIONS
  }

  async embed(text: string): Promise<Float32Array> {
    const pipe = await this.getPipeline()
    const output = await pipe(text, { pooling: 'mean', normalize: true })
    // `output.data` is a typed array. Copy into a fresh Float32Array so callers
    // can hold onto it independently of the transformers.js tensor lifecycle.
    return new Float32Array(output.data as Float32Array)
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipe) return this.pipe
    if (this.loading) return this.loading
    this.loading = (async () => {
      const pipe = (await pipeline(
        'feature-extraction',
        this.modelName,
      )) as FeatureExtractionPipeline
      this.pipe = pipe
      this.loading = null
      return pipe
    })()
    return this.loading
  }
}
