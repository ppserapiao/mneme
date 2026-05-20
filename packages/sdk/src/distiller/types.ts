import type { MemoryKind } from '@mnemehq/protocol'

/**
 * Pluggable LLM-powered memory extractor (ADR 0012).
 *
 * A distiller takes raw text (a conversation transcript, a journal entry, a
 * meeting summary) and returns structured `ExtractedMemory` candidates that
 * the SDK then persists via `remember()`.
 *
 * The SDK does not ship a default implementation. Bring your own adapter:
 *   - `@mnemehq/distiller-claude` — Anthropic-backed, BYO Anthropic key
 *   - `@mnemehq/distiller-openai` (forthcoming) — OpenAI-backed, BYO OpenAI key
 *   - `@mnemehq/distiller-local`  (forthcoming) — on-device via llama.cpp / transformers.js
 *
 * Implementations MUST:
 *   - Return memories matching the canonical {@link MemoryKind} enum.
 *   - Respect the `maxMemories` hint as a soft cap.
 *   - Surface failures as thrown errors — never return partial silent garbage.
 *   - Report token / cost usage so the SDK consumer can budget.
 */
export interface Distiller {
  /** Stable identifier for observability and telemetry. */
  readonly name: string
  /** Model identifier the adapter is configured to use. */
  readonly model: string
  /** Extract memories from `input.text`. */
  distill(input: DistillInput): Promise<DistillOutput>
}

export type DistillInput = {
  /** The raw text to distill. Required, non-empty. */
  text: string
  /** Optional hints to steer extraction. */
  hint?: {
    /**
     * Label identifying the speaker / author. For multi-voice transcripts,
     * the adapter should extract only memories about this party.
     */
    speakerLabel?: string
    /** Soft cap on extracted memories. Defaults to adapter-internal limit. */
    maxMemories?: number
    /** Free-form context the adapter may use to tune extraction. */
    sourceApp?: string
  }
}

export type ExtractedMemory = {
  kind: MemoryKind
  body: string
  /** Model's confidence in 0..1. The SDK skips below `distillOptions.minConfidence`. */
  confidence: number
  /**
   * Verbatim excerpt from the input that justifies this extraction. Persisted
   * as `metadata.sourceContext` on the resulting record. Optional, but adapters
   * are strongly encouraged to populate it.
   */
  sourceContext?: string
}

export type DistillOutput = {
  extracted: ExtractedMemory[]
  /** Token usage + best-effort cost estimate (USD). */
  usage: {
    promptTokens: number
    completionTokens: number
    costUsdEstimate: number
  }
  /** Model identifier as reported by the provider. */
  model: string
}

/** Options accepted by `mneme.distill()`. */
export type DistillOptions = {
  /**
   * Tag every persisted memory with this `sourceApp`. The adapter receives
   * it as a hint; the SDK also propagates it to `remember()` so memories
   * are attributable to their origin.
   */
  sourceApp?: string
  /**
   * Skip extractions below this confidence (0..1). Default: 0.5. Lower for
   * recall-heavy use cases, raise for precision-heavy ones.
   */
  minConfidence?: number
  /** Passthrough hints to the distiller adapter. */
  hint?: DistillInput['hint']
}

/** Result of `mneme.distill()`. */
export type DistillResult<TRecord = unknown> = {
  /** Records that were persisted to the store. */
  written: TRecord[]
  /** How many candidates were skipped due to `minConfidence`. */
  skipped: number
  /** Token + cost usage reported by the adapter. */
  usage: DistillOutput['usage']
  /** Model identifier returned by the adapter. */
  model: string
}
