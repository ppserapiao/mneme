import { randomUUID } from 'node:crypto'
import type { DistillInput, DistillOutput, Distiller, ExtractedMemory } from '@mnemehq/sdk'
import { Memory as Mem0Memory, type MemoryConfig, type MemoryItem } from 'mem0ai/oss'

/**
 * Mem0 distiller adapter (ADR 0015). Wraps the `mem0ai` open-source SDK
 * behind the `Distiller` interface so the existing eval runner scores
 * Mem0 the same way it scores mneme — same corpus, same matchers,
 * same judge.
 *
 * Configuration (per ADR 0015 §2 — Mem0's default-recommended settings):
 *   - LLM:          claude-sonnet-4-6 via AnthropicLLM (same model as mneme — fairest)
 *   - Embedder:     OpenAI text-embedding-3-small (Mem0's default; OpenAI is the only
 *                   embedding provider that fits "zero local setup" + "no Google deps")
 *   - Vector store: MemoryVectorStore (in-memory; no Qdrant / pgvector required)
 *   - History:      disabled (per-sample isolation makes history irrelevant)
 *   - infer:        true (the default; without this Mem0 doesn't extract at all)
 *
 * Per-sample isolation: a fresh UUID `user_id` per sample. Memories don't
 * leak across samples. The Mem0 instance is reused for prompt-cache benefits
 * but the entity-store is partitioned by user_id.
 *
 * Kind mapping (ADR 0015 §4): every Mem0 memory is assigned kind `'fact'`.
 * Mem0 doesn't classify by kind; defaulting to 'fact' is the documented
 * methodology choice. Will under-count in STRICT scoring when the corpus
 * expects 'preference' / 'event' / etc.; the SEMANTIC judge corrects this
 * because the judge's decision rules are kind-tolerant when body content
 * matches.
 *
 * Cost: not auto-tracked inside Mem0 (limitation, v0.2 target). Users
 * monitor Anthropic + OpenAI dashboards. Approximate per-run cost against
 * the 100-sample corpus: ~$0.30 Anthropic + ~$0.05 OpenAI = ~$0.35.
 */
export type Mem0DistillerOptions = {
  /** Anthropic API key (Mem0's LLM). Required unless `memory` is supplied. */
  anthropicApiKey?: string
  /** OpenAI API key (Mem0's embedder). Required unless `memory` is supplied. */
  openaiApiKey?: string
  /**
   * Anthropic model passed to Mem0's LLM. Default: claude-sonnet-4-6 (same
   * model mneme's distiller uses, for the fairest direct comparison).
   */
  llmModel?: string
  /**
   * OpenAI embedding model. Default: text-embedding-3-small (Mem0's default).
   * 1536-dimensional embeddings.
   */
  embedderModel?: string
  /**
   * Override the Memory instance entirely (for tests). When set, the apiKey
   * / model options above are ignored.
   */
  memory?: Mem0Memory
  /**
   * Observability hook fired on each per-sample run. Useful for live
   * progress and cost monitoring.
   */
  onEvent?: (event: Mem0Event) => void
}

export type Mem0Event =
  | { type: 'sample-start'; userId: string; inputChars: number }
  | { type: 'sample-end'; userId: string; extractedCount: number; durationMs: number }
  | { type: 'sample-error'; userId: string; error: Error }

/** Mem0 OSS package version this adapter is targeting. Surfaces in baseline filenames. */
export const MEM0_TARGET_VERSION = '3.0.3'

/**
 * @see ADR 0015 for the methodology, fair-config choices, and limitations.
 */
export class Mem0Distiller implements Distiller {
  readonly name = 'mem0-distiller'
  /** Composite identifier: LLM-model + embedder-model, so the baseline header is interpretable. */
  readonly model: string
  /** Stamped onto every report so the baseline reflects the Mem0 version under test (ADR 0015 §6). */
  readonly promptVersion: string
  private readonly memory: Mem0Memory
  private readonly onEvent: Mem0DistillerOptions['onEvent']

  constructor(options: Mem0DistillerOptions = {}) {
    const llmModel = options.llmModel ?? 'claude-sonnet-4-6'
    const embedderModel = options.embedderModel ?? 'text-embedding-3-small'
    this.model = `${llmModel}+${embedderModel}`
    this.promptVersion = `mem0-v${MEM0_TARGET_VERSION}`
    this.onEvent = options.onEvent

    if (options.memory) {
      this.memory = options.memory
      return
    }

    if (!options.anthropicApiKey || options.anthropicApiKey.trim().length === 0) {
      throw new Error(
        'Mem0Distiller requires anthropicApiKey (Mem0 uses it for the LLM). ' +
          "Set in your terminal: export ANTHROPIC_API_KEY='sk-ant-...'",
      )
    }
    if (!options.openaiApiKey || options.openaiApiKey.trim().length === 0) {
      throw new Error(
        'Mem0Distiller requires openaiApiKey (Mem0 uses it for the embedder). ' +
          "Set in your terminal: export OPENAI_API_KEY='sk-...'  " +
          'Anthropic does not ship an embeddings API.',
      )
    }

    const config: Partial<MemoryConfig> = {
      llm: {
        provider: 'anthropic',
        config: {
          apiKey: options.anthropicApiKey,
          model: llmModel,
        },
      },
      embedder: {
        provider: 'openai',
        config: {
          apiKey: options.openaiApiKey,
          model: embedderModel,
        },
      },
      vectorStore: {
        provider: 'memory',
        config: {
          collectionName: 'mneme-eval-mem0',
        },
      },
      disableHistory: true,
    }
    this.memory = new Mem0Memory(config)
  }

  async distill(input: DistillInput): Promise<DistillOutput> {
    const userId = randomUUID()
    this.onEvent?.({ type: 'sample-start', userId, inputChars: input.text.length })
    const start = performance.now()

    try {
      // Step 1: hand the text to Mem0, which extracts + stores under this user_id.
      // `infer: true` is the default and required for extraction (without it,
      // Mem0 just stores the raw message verbatim — no comparison meaning).
      await this.memory.add(
        [
          {
            role: 'user',
            content: input.text,
          },
        ],
        { userId, infer: true },
      )

      // Step 2: read back everything Mem0 stored for this user.
      const result = await this.memory.getAll({ filters: { user_id: userId } })

      // Step 3: map Mem0's shape → our ExtractedMemory shape.
      const extracted: ExtractedMemory[] = result.results.map((item: MemoryItem) => ({
        // Default-fact per ADR 0015 §4. The semantic judge handles kind-tolerance.
        kind: 'fact',
        body: item.memory,
        // Mem0 doesn't return a confidence; we report 1.0 to signal "Mem0 chose to
        // store this, so it's at least as confident as its own threshold." This
        // does not affect scoring; matcher / judge look at body + kind only.
        confidence: 1,
      }))

      const durationMs = Math.round(performance.now() - start)
      this.onEvent?.({
        type: 'sample-end',
        userId,
        extractedCount: extracted.length,
        durationMs,
      })

      return {
        extracted,
        // Cost not auto-tracked inside Mem0; this is a v0.2 target. Reporting 0
        // lets the eval report sum cleanly; the run prelude warns the user about
        // expected Anthropic + OpenAI spend (~$0.35 per 100-sample run).
        usage: { promptTokens: 0, completionTokens: 0, costUsdEstimate: 0 },
        model: this.model,
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.onEvent?.({ type: 'sample-error', userId, error })
      throw error
    }
  }
}
