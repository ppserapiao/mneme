import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { MemoryLifecycle } from '@mneme/protocol'
import { type InProcessSyncPeer, Mneme } from './index'
import { mergeLifecycle } from './sync/lifecycle-merge'

// ----------------------------------------------------------------------------
// Pure merge tests — exercise the lifecycle CRDT in isolation.
// ----------------------------------------------------------------------------

describe('mergeLifecycle — pure merge semantics (ADR 0008 §2)', () => {
  const noCtx = { createdAtOf: () => undefined }

  test('two empty envelopes merge to empty', () => {
    expect(mergeLifecycle({}, {}, noCtx)).toEqual({})
  })

  test('a single-sided supersededBy is preserved', () => {
    const a: MemoryLifecycle = { supersededBy: '01ARZ3NDEKTSV4RRFFQ69G5FAV' as never }
    expect(mergeLifecycle(a, {}, noCtx)).toEqual(a)
    expect(mergeLifecycle({}, a, noCtx)).toEqual(a)
  })

  test('expiresAt: earliest wins', () => {
    const earlier = '2025-01-01T00:00:00.000Z'
    const later = '2027-01-01T00:00:00.000Z'
    expect(mergeLifecycle({ expiresAt: earlier }, { expiresAt: later }, noCtx).expiresAt).toBe(
      earlier,
    )
    expect(mergeLifecycle({ expiresAt: later }, { expiresAt: earlier }, noCtx).expiresAt).toBe(
      earlier,
    )
  })

  test('forgetAt: earliest wins', () => {
    const earlier = '2025-06-01T00:00:00.000Z'
    const later = '2030-06-01T00:00:00.000Z'
    expect(mergeLifecycle({ forgetAt: earlier }, { forgetAt: later }, noCtx).forgetAt).toBe(earlier)
  })

  test('supersededBy: target with latest createdAt wins', () => {
    const ctx = {
      createdAtOf(id: string): string | undefined {
        if (id === 'replA') return '2026-01-01T00:00:00.000Z'
        if (id === 'replB') return '2026-06-01T00:00:00.000Z'
        return undefined
      },
    }
    const a: MemoryLifecycle = { supersededBy: 'replA' as never }
    const b: MemoryLifecycle = { supersededBy: 'replB' as never }
    expect(mergeLifecycle(a, b, ctx).supersededBy).toBe('replB' as never)
    expect(mergeLifecycle(b, a, ctx).supersededBy).toBe('replB' as never)
  })

  test('supersededBy: identical ids merge to themselves', () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    const a: MemoryLifecycle = { supersededBy: id as never }
    expect(mergeLifecycle(a, a, noCtx).supersededBy).toBe(id as never)
  })

  test('supersededBy: lexicographic tie-break when context is missing on both sides', () => {
    const a: MemoryLifecycle = { supersededBy: '01ARZ3NDEKTSV4RRFFQ69G5FAA' as never }
    const b: MemoryLifecycle = { supersededBy: '01ARZ3NDEKTSV4RRFFQ69G5FAZ' as never }
    expect(mergeLifecycle(a, b, noCtx).supersededBy).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAZ' as never)
  })

  test('merge is commutative across all three fields', () => {
    const a: MemoryLifecycle = {
      supersededBy: '01ARZ3NDEKTSV4RRFFQ69G5FAA' as never,
      expiresAt: '2026-01-01T00:00:00.000Z',
      forgetAt: '2030-01-01T00:00:00.000Z',
    }
    const b: MemoryLifecycle = {
      supersededBy: '01ARZ3NDEKTSV4RRFFQ69G5FAZ' as never,
      expiresAt: '2025-06-01T00:00:00.000Z',
      forgetAt: '2029-06-01T00:00:00.000Z',
    }
    expect(mergeLifecycle(a, b, noCtx)).toEqual(mergeLifecycle(b, a, noCtx))
  })

  test('merge is idempotent — merge(a, a) = a', () => {
    const a: MemoryLifecycle = {
      supersededBy: '01ARZ3NDEKTSV4RRFFQ69G5FAA' as never,
      expiresAt: '2026-01-01T00:00:00.000Z',
      forgetAt: '2030-01-01T00:00:00.000Z',
    }
    expect(mergeLifecycle(a, a, noCtx)).toEqual(a)
  })
})

// ----------------------------------------------------------------------------
// End-to-end engine tests — two real Mnemes, real SQLite (in-memory).
// ----------------------------------------------------------------------------

describe('Mneme.sync — engine convergence', () => {
  let alice: Mneme
  let bob: Mneme
  let bobPeer: InProcessSyncPeer

  beforeEach(() => {
    alice = new Mneme({ path: ':memory:', ownerId: 'pedro' })
    bob = new Mneme({ path: ':memory:', ownerId: 'pedro' })
    bobPeer = bob.asPeer() as InProcessSyncPeer
  })

  afterEach(() => {
    alice.close()
    bob.close()
  })

  test('one-way push: a record written on alice appears on bob after sync', async () => {
    const written = await alice.remember({ kind: 'fact', body: 'london resident' })
    const result = await alice.sync(bobPeer)
    expect(result.pushed).toBe(1)
    expect(result.pulled).toBe(0)
    expect(result.merged).toBe(0)

    const onBob = await bob.get(written.id)
    expect(onBob?.body).toEqual({ mode: 'plaintext', data: 'london resident' })
  })

  test('one-way pull: a record written on bob appears on alice after sync', async () => {
    const written = await bob.remember({ kind: 'preference', body: 'prefers terse reviews' })
    const result = await alice.sync(bobPeer)
    expect(result.pulled).toBe(1)
    expect(result.pushed).toBe(0)

    const onAlice = await alice.get(written.id)
    expect(onAlice?.body).toEqual({ mode: 'plaintext', data: 'prefers terse reviews' })
  })

  test('bidirectional convergence — both sides write, both end up with all records', async () => {
    await alice.remember({ kind: 'fact', body: 'a1' })
    await alice.remember({ kind: 'fact', body: 'a2' })
    await bob.remember({ kind: 'fact', body: 'b1' })
    await bob.remember({ kind: 'fact', body: 'b2' })
    await bob.remember({ kind: 'fact', body: 'b3' })

    const result = await alice.sync(bobPeer)
    expect(result.pushed).toBe(2)
    expect(result.pulled).toBe(3)
    expect(result.merged).toBe(0)

    const allOnAlice = []
    for await (const r of alice.exportAll()) allOnAlice.push(r)
    const allOnBob = []
    for await (const r of bob.exportAll()) allOnBob.push(r)

    expect(allOnAlice.length).toBe(5)
    expect(allOnBob.length).toBe(5)
    const aliceBodies = new Set(allOnAlice.map((r) => (r.body as { data: string }).data))
    const bobBodies = new Set(allOnBob.map((r) => (r.body as { data: string }).data))
    expect(aliceBodies).toEqual(bobBodies)
  })

  test('idempotent: second sync is a no-op', async () => {
    await alice.remember({ kind: 'fact', body: 'x' })
    await bob.remember({ kind: 'fact', body: 'y' })
    await alice.sync(bobPeer)

    const second = await alice.sync(bobPeer)
    expect(second.pushed).toBe(0)
    expect(second.pulled).toBe(0)
    expect(second.merged).toBe(0)
  })

  test('forget on one side propagates the earliest expiry after sync', async () => {
    const r = await alice.remember({ kind: 'fact', body: 'forget me' })
    await alice.sync(bobPeer) // bob now has the record too

    await alice.forget(r.id) // alice marks it expired now
    const second = await alice.sync(bobPeer)
    expect(second.merged).toBe(1)

    const onBob = await bob.get(r.id)
    // Lifecycle expiresAt should have propagated.
    expect(onBob?.lifecycle.expiresAt).toBeDefined()
  })

  test('concurrent supersede: both replacements kept, pointer follows the latest createdAt', async () => {
    const original = await alice.remember({ kind: 'preference', body: 'verbose' })
    await alice.sync(bobPeer) // both sides now have `original`

    // Both supersede concurrently with different replacements.
    const aReplacement = await alice.supersede(original.id, {
      kind: 'preference',
      body: 'concise (alice)',
    })
    // Force bob's clock forward enough that its replacement has a later
    // createdAt — easiest way to guarantee ordering for the assertion.
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
    const bReplacement = await bob.supersede(original.id, {
      kind: 'preference',
      body: 'concise (bob)',
    })

    await alice.sync(bobPeer)

    // Both replacement records exist on both sides.
    expect(await alice.get(aReplacement.id)).not.toBeNull()
    expect(await alice.get(bReplacement.id)).not.toBeNull()
    expect(await bob.get(aReplacement.id)).not.toBeNull()
    expect(await bob.get(bReplacement.id)).not.toBeNull()

    // Pointer on the original follows the LATER replacement's createdAt
    // (bob's replacement, written second).
    const onAlice = await alice.get(original.id)
    const onBob = await bob.get(original.id)
    expect(onAlice?.lifecycle.supersededBy).toBe(bReplacement.id)
    expect(onBob?.lifecycle.supersededBy).toBe(bReplacement.id)
  })

  test('owner isolation — sync does not leak across owners', async () => {
    const charlieAlice = new Mneme({ path: ':memory:', ownerId: 'charlie' })
    try {
      await charlieAlice.remember({ kind: 'fact', body: 'charlie secret' })

      // Sync pedro<->bob: charlie's secret must not appear anywhere.
      await alice.sync(bobPeer)

      const onAlice = []
      for await (const r of alice.exportAll()) onAlice.push(r)
      const onBob = []
      for await (const r of bob.exportAll()) onBob.push(r)
      expect(onAlice.length).toBe(0)
      expect(onBob.length).toBe(0)
    } finally {
      charlieAlice.close()
    }
  })
})

// ----------------------------------------------------------------------------
// Same-master-key encrypted sync (sanity check that the engine treats
// encrypted records as opaque bytes — pairing for v0.0.7 will handle the
// key transfer; here we manually align master keys via direct DB copy).
// ----------------------------------------------------------------------------

describe('Mneme.sync — encrypted records are exchanged opaquely', () => {
  test('plaintext sync preserves body content end-to-end', async () => {
    // Encryption requires shared keyring; v0.0.6 ships the engine, not
    // pairing. Here we verify the engine's behaviour under PLAINTEXT mode
    // and document that encrypted exchange follows the same code path —
    // upsertForSync writes whatever Payload it receives without inspecting
    // its mode.
    const a = new Mneme({ path: ':memory:', ownerId: 'p' })
    const b = new Mneme({ path: ':memory:', ownerId: 'p' })
    try {
      const r = await a.remember({ kind: 'fact', body: 'plain content end to end' })
      await a.sync(b.asPeer())
      const back = await b.get(r.id)
      expect(back?.body).toEqual({ mode: 'plaintext', data: 'plain content end to end' })
    } finally {
      a.close()
      b.close()
    }
  })
})
