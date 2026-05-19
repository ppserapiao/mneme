import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Mneme } from './index'
import type { Clock } from './util/clock'

function frozenClock(iso: string): Clock {
  return { now: () => new Date(iso) }
}

describe('Mneme — local SDK', () => {
  let mneme: Mneme

  beforeEach(() => {
    mneme = new Mneme({
      path: ':memory:',
      ownerId: 'test-owner',
      clock: frozenClock('2026-05-19T12:00:00.000Z'),
    })
  })

  afterEach(() => {
    mneme.close()
  })

  test('remember persists a memory with sensible defaults', async () => {
    const record = await mneme.remember({
      kind: 'preference',
      body: 'Prefers concise code review comments',
    })

    expect(record.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(String(record.ownerId)).toBe('test-owner')
    expect(record.kind).toBe('preference')
    expect(record.body).toEqual({ mode: 'plaintext', data: 'Prefers concise code review comments' })
    expect(record.metadata.sourceApp).toBe('unknown')
    expect(record.metadata.createdAt).toBe('2026-05-19T12:00:00.000Z')
    expect(record.lifecycle).toEqual({})
  })

  test('remember preserves sourceApp, tags, confidence when provided', async () => {
    const record = await mneme.remember({
      kind: 'fact',
      body: 'Pedro is based in the UK',
      sourceApp: 'claude-code',
      confidence: 0.95,
      tags: ['location', 'biography'],
    })

    expect(record.metadata.sourceApp).toBe('claude-code')
    expect(record.metadata.confidence).toBe(0.95)
    expect(record.metadata.tags).toEqual(['location', 'biography'])
  })

  test('get retrieves a written record by id', async () => {
    const written = await mneme.remember({ kind: 'fact', body: 'works in TypeScript' })
    const retrieved = await mneme.get(written.id)
    expect(retrieved?.id).toBe(written.id)
    expect(retrieved?.body).toEqual({ mode: 'plaintext', data: 'works in TypeScript' })
  })

  test('get returns null for unknown id', async () => {
    const retrieved = await mneme.get('01ARZ3NDEKTSV4RRFFQ69G5FAV' as never)
    expect(retrieved).toBeNull()
  })

  test('recall returns the most relevant matches by lexical similarity', async () => {
    await mneme.remember({ kind: 'preference', body: 'Prefers concise code review comments' })
    await mneme.remember({ kind: 'fact', body: 'Reviews other peoples code carefully' })
    await mneme.remember({ kind: 'preference', body: 'Drinks oat milk lattes every morning' })

    const matches = await mneme.recall('code review')
    expect(matches.length).toBeGreaterThanOrEqual(2)
    expect(matches[0]?.record.body).toEqual({
      mode: 'plaintext',
      data: 'Prefers concise code review comments',
    })
    for (let i = 1; i < matches.length; i++) {
      const prev = matches[i - 1]?.score ?? Number.POSITIVE_INFINITY
      const curr = matches[i]?.score ?? Number.NEGATIVE_INFINITY
      expect(prev).toBeGreaterThanOrEqual(curr)
    }
  })

  test('recall respects kind filter', async () => {
    await mneme.remember({ kind: 'fact', body: 'loves coffee' })
    await mneme.remember({ kind: 'preference', body: 'loves coffee' })

    const matches = await mneme.recall('coffee', { kinds: ['preference'] })
    expect(matches.length).toBe(1)
    expect(matches[0]?.record.kind).toBe('preference')
  })

  test('recall respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await mneme.remember({ kind: 'fact', body: `recurring topic ${i}` })
    }
    const matches = await mneme.recall('recurring', { limit: 2 })
    expect(matches.length).toBe(2)
  })

  test('recall returns no results for empty / punctuation-only query', async () => {
    await mneme.remember({ kind: 'fact', body: 'something' })
    const matches = await mneme.recall('???')
    expect(matches).toEqual([])
  })

  test('forget removes the record from recall results', async () => {
    const written = await mneme.remember({ kind: 'fact', body: 'secret note about something' })
    expect((await mneme.recall('secret note')).length).toBeGreaterThan(0)

    await mneme.forget(written.id)
    expect(await mneme.recall('secret note')).toEqual([])
  })

  test('forget still allows direct read for audit purposes', async () => {
    const written = await mneme.remember({ kind: 'fact', body: 'audit me' })
    await mneme.forget(written.id)
    const retrieved = await mneme.get(written.id)
    expect(retrieved?.lifecycle.expiresAt).toBe('2026-05-19T12:00:00.000Z')
  })

  test('forget with hard=true schedules a hard delete', async () => {
    const written = await mneme.remember({ kind: 'fact', body: 'goodbye' })
    await mneme.forget(written.id, { hard: true })
    const retrieved = await mneme.get(written.id)
    expect(retrieved?.lifecycle.forgetAt).toBe('2026-05-19T12:00:00.000Z')
  })

  test('supersede links the old record and replaces it in recall', async () => {
    const original = await mneme.remember({
      kind: 'preference',
      body: 'Prefers verbose code review comments',
    })

    const replacement = await mneme.supersede(original.id, {
      kind: 'preference',
      body: 'Prefers concise code review comments',
    })

    const reread = await mneme.get(original.id)
    expect(reread?.lifecycle.supersededBy).toBe(replacement.id)

    const matches = await mneme.recall('code review')
    expect(matches.length).toBe(1)
    expect(matches[0]?.record.id).toBe(replacement.id)
  })

  test('exportAll yields every record including superseded ones', async () => {
    const a = await mneme.remember({ kind: 'fact', body: 'one' })
    const b = await mneme.remember({ kind: 'fact', body: 'two' })
    await mneme.supersede(a.id, { kind: 'fact', body: 'one revised' })

    const all = []
    for await (const record of mneme.exportAll()) {
      all.push(record)
    }
    expect(all.length).toBe(3)
    expect(all.map((r) => r.body.mode)).toEqual(['plaintext', 'plaintext', 'plaintext'])

    const ids = all.map((r) => r.id)
    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
  })

  test('forget throws record_not_found for unknown id', async () => {
    await expect(mneme.forget('01ARZ3NDEKTSV4RRFFQ69G5FAV' as never)).rejects.toMatchObject({
      code: 'record_not_found',
    })
  })
})

describe('Mneme — isolation between owners', () => {
  test('records written under one owner are invisible to another', async () => {
    const pedro = new Mneme({ path: ':memory:', ownerId: 'pedro' })
    const ana = new Mneme({ path: ':memory:', ownerId: 'ana' })
    try {
      const record = await pedro.remember({ kind: 'fact', body: 'pedro secret' })
      expect(await ana.get(record.id)).toBeNull()
      expect(await ana.recall('pedro')).toEqual([])
    } finally {
      pedro.close()
      ana.close()
    }
  })
})
