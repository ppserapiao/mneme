/**
 * Best-effort cost estimation per Claude model. Prices in USD per million
 * tokens. Updated 2026-05-20 against Anthropic's public pricing page.
 *
 * If we don't recognise the model, we return 0 — better than a wildly wrong
 * estimate. Adapters should treat `costUsdEstimate` as advisory, not exact.
 */
type PriceTable = {
  inputPerMillion: number
  outputPerMillion: number
  /** Cached-input rate (prompt cache hit). */
  cachedInputPerMillion: number
  /** One-time cache-write rate (first call that populates the cache block). */
  cacheWritePerMillion: number
}

const PRICES: Record<string, PriceTable> = {
  // Sonnet tier (current default)
  'claude-sonnet-4-7': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cachedInputPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cachedInputPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  'claude-sonnet-4-5': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cachedInputPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  // Haiku tier (small/fast)
  'claude-haiku-4-5': {
    inputPerMillion: 1,
    outputPerMillion: 5,
    cachedInputPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
  },
  // Opus tier (large/best)
  'claude-opus-4-7': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cachedInputPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
  'claude-opus-4-6': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cachedInputPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
}

export type AnthropicUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * Compute an estimated USD cost for a single Anthropic message-create call.
 * Splits input tokens into (cached read, cache write, uncached) buckets per
 * the SDK's usage fields and applies the appropriate rate to each.
 */
export function estimateCostUsd(model: string, usage: AnthropicUsage): number {
  const table = resolvePriceTable(model)
  if (!table) return 0

  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const uncachedInput = Math.max(0, usage.input_tokens - cacheRead - cacheWrite)

  const inputCost =
    (uncachedInput * table.inputPerMillion +
      cacheRead * table.cachedInputPerMillion +
      cacheWrite * table.cacheWritePerMillion) /
    1_000_000
  const outputCost = (usage.output_tokens * table.outputPerMillion) / 1_000_000
  return round6(inputCost + outputCost)
}

function resolvePriceTable(model: string): PriceTable | undefined {
  // Exact match first.
  const direct = PRICES[model]
  if (direct) return direct
  // Try matching by the date-stamped variant (e.g. claude-sonnet-4-5-20251022 → claude-sonnet-4-5).
  for (const known of Object.keys(PRICES)) {
    if (model.startsWith(`${known}-`) || model.startsWith(known)) return PRICES[known]
  }
  return undefined
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
