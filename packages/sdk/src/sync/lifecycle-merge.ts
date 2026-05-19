import type { MemoryLifecycle } from '@mnemehq/protocol'

/**
 * Merge two lifecycle envelopes per ADR 0008 §2.
 *
 * - `supersededBy`: keep the entry whose target record has the LATEST
 *   `metadata.createdAt`. We do not have the target's createdAt at merge
 *   time, so we pass it in via `supersedeContext` lookup. When the lookup
 *   cannot decide (both targets missing, e.g. before they sync), we fall
 *   back to a stable tie-break: lexicographically larger ULID wins (ULIDs
 *   are time-prefixed, so larger ≈ later in practice).
 * - `expiresAt`: earliest wins (the strictest expiry is honoured).
 * - `forgetAt`: earliest wins (the strictest forget schedule is honoured).
 *
 * The merge is deterministic, commutative, and idempotent.
 */
export type SupersedeContext = {
  /** Lookup of memory id → its `metadata.createdAt`, used to pick the winner of a supersededBy race. */
  createdAtOf(id: string): string | undefined
}

export function mergeLifecycle(
  a: MemoryLifecycle,
  b: MemoryLifecycle,
  ctx: SupersedeContext,
): MemoryLifecycle {
  const merged: MemoryLifecycle = {}

  const supersededBy = pickSupersededBy(a.supersededBy, b.supersededBy, ctx)
  if (supersededBy !== undefined) merged.supersededBy = supersededBy

  const expiresAt = earliest(a.expiresAt, b.expiresAt)
  if (expiresAt !== undefined) merged.expiresAt = expiresAt

  const forgetAt = earliest(a.forgetAt, b.forgetAt)
  if (forgetAt !== undefined) merged.forgetAt = forgetAt

  return merged
}

function pickSupersededBy(
  a: MemoryLifecycle['supersededBy'],
  b: MemoryLifecycle['supersededBy'],
  ctx: SupersedeContext,
): MemoryLifecycle['supersededBy'] {
  if (a === undefined) return b
  if (b === undefined) return a
  if (a === b) return a
  const ta = ctx.createdAtOf(a as string)
  const tb = ctx.createdAtOf(b as string)
  if (ta !== undefined && tb !== undefined) {
    if (ta === tb) return a > b ? a : b
    return ta > tb ? a : b
  }
  if (ta !== undefined) return a
  if (tb !== undefined) return b
  // Both targets unknown locally — stable lexicographic tie-break. ULIDs are
  // time-prefixed so the larger string is later in practice.
  return a > b ? a : b
}

function earliest(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return a < b ? a : b
}

/** Whether two lifecycle envelopes are structurally equal (used to skip unnecessary writes). */
export function lifecycleEquals(a: MemoryLifecycle, b: MemoryLifecycle): boolean {
  return (
    a.supersededBy === b.supersededBy && a.expiresAt === b.expiresAt && a.forgetAt === b.forgetAt
  )
}
