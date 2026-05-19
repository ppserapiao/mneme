/**
 * Time source. Injected so tests can pin "now" and ULID generation is
 * deterministic without touching the global Date.
 */
export type Clock = {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}
