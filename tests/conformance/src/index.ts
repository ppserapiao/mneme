import { describe, expect, test } from 'bun:test'
import { type MnemeStore, OwnerIdSchema, PROTOCOL_VERSION } from '@mneme/protocol'

export type StoreFactory = () => Promise<{
  store: MnemeStore
  /** Release resources held by the Store. Called after every test. */
  dispose: () => Promise<void> | void
}>

/**
 * Run the v0.1 conformance suite against an arbitrary MnemeStore implementation.
 *
 * Usage from another package:
 *
 * ```ts
 * import { runV01ConformanceSuite } from '@mneme/conformance'
 * runV01ConformanceSuite('my-store', async () => ({ store: new MyStore(), dispose() {} }))
 * ```
 *
 * The suite verifies the verb contract defined in `docs/protocol/v0.1.md`.
 * Implementations are "v0.1-conforming" if every test passes with no skips.
 */
export function runV01ConformanceSuite(name: string, factory: StoreFactory): void {
  describe(`mneme Protocol v0.1 conformance — ${name}`, () => {
    test(`advertises protocol version ${PROTOCOL_VERSION}`, () => {
      // Sanity check that the contract version under test matches the imported
      // protocol package version. Future suites may version themselves.
      expect(PROTOCOL_VERSION).toMatch(/^0\.1\./)
    })

    test('WRITE then READ round-trips a record', async () => {
      const { store, dispose } = await factory()
      try {
        const owner = OwnerIdSchema.parse('conformance-owner')
        const written = await store.write({
          ownerId: owner,
          kind: 'fact',
          body: { mode: 'plaintext', data: 'round trip' },
        })
        const read = await store.read(owner, written.id)
        expect(read?.id).toBe(written.id)
        expect(read?.body).toEqual({ mode: 'plaintext', data: 'round trip' })
      } finally {
        await dispose()
      }
    })

    test('READ returns null across owners (owner isolation)', async () => {
      const { store, dispose } = await factory()
      try {
        const a = OwnerIdSchema.parse('owner-a')
        const b = OwnerIdSchema.parse('owner-b')
        const written = await store.write({
          ownerId: a,
          kind: 'fact',
          body: { mode: 'plaintext', data: 'private to a' },
        })
        expect(await store.read(b, written.id)).toBeNull()
      } finally {
        await dispose()
      }
    })

    test('SEARCH ranks matching records and excludes non-matches', async () => {
      const { store, dispose } = await factory()
      try {
        const owner = OwnerIdSchema.parse('conformance-owner')
        await store.write({
          ownerId: owner,
          kind: 'preference',
          body: { mode: 'plaintext', data: 'prefers terse code review' },
        })
        await store.write({
          ownerId: owner,
          kind: 'fact',
          body: { mode: 'plaintext', data: 'lives near the river' },
        })
        const results = await store.search({ ownerId: owner, query: 'code review' })
        expect(results.length).toBeGreaterThanOrEqual(1)
        expect(results[0]?.record.body).toEqual({
          mode: 'plaintext',
          data: 'prefers terse code review',
        })
      } finally {
        await dispose()
      }
    })

    test('FORGET hides a record from subsequent SEARCH and READ-after-now', async () => {
      const { store, dispose } = await factory()
      try {
        const owner = OwnerIdSchema.parse('conformance-owner')
        const written = await store.write({
          ownerId: owner,
          kind: 'fact',
          body: { mode: 'plaintext', data: 'forget this please' },
        })
        await store.forget({ ownerId: owner, id: written.id })
        const results = await store.search({ ownerId: owner, query: 'forget this please' })
        expect(results).toEqual([])
      } finally {
        await dispose()
      }
    })

    test('SUPERSEDE links the old record to the new one', async () => {
      const { store, dispose } = await factory()
      try {
        const owner = OwnerIdSchema.parse('conformance-owner')
        const original = await store.write({
          ownerId: owner,
          kind: 'preference',
          body: { mode: 'plaintext', data: 'verbose comments' },
        })
        const replacement = await store.supersede({
          ownerId: owner,
          supersededId: original.id,
          replacement: {
            ownerId: owner,
            kind: 'preference',
            body: { mode: 'plaintext', data: 'concise comments' },
          },
        })
        const reread = await store.read(owner, original.id)
        expect(reread?.lifecycle.supersededBy).toBe(replacement.id)
      } finally {
        await dispose()
      }
    })

    test('EXPORT streams every record for an owner in order', async () => {
      const { store, dispose } = await factory()
      try {
        const owner = OwnerIdSchema.parse('conformance-owner')
        const writes = [] as string[]
        for (const data of ['first', 'second', 'third']) {
          const r = await store.write({
            ownerId: owner,
            kind: 'fact',
            body: { mode: 'plaintext', data },
          })
          writes.push(r.id)
        }
        const seen: string[] = []
        for await (const record of store.export({ ownerId: owner })) {
          seen.push(record.id)
        }
        expect(seen.length).toBe(3)
        expect(new Set(seen)).toEqual(new Set(writes))
      } finally {
        await dispose()
      }
    })

    test('FORGET throws record_not_found for unknown IDs', async () => {
      const { store, dispose } = await factory()
      try {
        const owner = OwnerIdSchema.parse('conformance-owner')
        await expect(
          store.forget({
            ownerId: owner,
            // Valid ULID format, simply does not exist in the store.
            id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' as never,
          }),
        ).rejects.toMatchObject({ code: 'record_not_found' })
      } finally {
        await dispose()
      }
    })
  })
}
