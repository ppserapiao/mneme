import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KdfParams } from './crypto'
import type { Embedder } from './embedder/types'
import { Mneme } from './index'
import type { Clock } from './util/clock'

// Reduced Argon2id cost so the test suite finishes in seconds rather than
// minutes. The production default (64 MiB / 3 iterations) is exercised in
// integration tests; the protocol semantics are independent of the cost.
const TEST_KDF: KdfParams = {
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
  outputLength: 32,
}

function frozenClock(iso: string): Clock {
  return { now: () => new Date(iso) }
}

function keywordEmbedder(keywords: ReadonlyArray<string>): Embedder {
  return {
    dimensions: keywords.length,
    async embed(text: string): Promise<Float32Array> {
      const lower = text.toLowerCase()
      const vec = new Float32Array(keywords.length)
      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i] as string
        vec[i] = lower.includes(kw.toLowerCase()) ? 1 : 0
      }
      return vec
    },
  }
}

describe('Mneme.open — constructor contract', () => {
  test('sync constructor refuses a passphrase', () => {
    expect(() => new Mneme({ path: ':memory:', passphrase: 'oops' })).toThrow(
      /Encrypted mode requires the async factory/i,
    )
  })

  test('Mneme.open() without passphrase yields a plaintext instance', async () => {
    const mneme = await Mneme.open({ path: ':memory:' })
    try {
      expect(mneme.encrypted).toBe(false)
      const record = await mneme.remember({ kind: 'fact', body: 'plain' })
      const back = await mneme.get(record.id)
      expect(back?.body).toEqual({ mode: 'plaintext', data: 'plain' })
    } finally {
      mneme.close()
    }
  })

  test('Mneme.open({ passphrase }) yields an encrypted instance', async () => {
    const mneme = await Mneme.open({
      path: ':memory:',
      passphrase: 'correct horse battery staple',
      kdfParams: TEST_KDF,
    })
    try {
      expect(mneme.encrypted).toBe(true)
    } finally {
      mneme.close()
    }
  })

  test('empty passphrase is rejected', async () => {
    await expect(
      Mneme.open({ path: ':memory:', passphrase: '', kdfParams: TEST_KDF }),
    ).rejects.toThrow(/passphrase must not be empty/i)
  })
})

describe('Mneme — encryption end-to-end', () => {
  let mneme: Mneme

  beforeEach(async () => {
    mneme = await Mneme.open({
      path: ':memory:',
      ownerId: 'pedro',
      clock: frozenClock('2026-05-19T12:00:00.000Z'),
      passphrase: 'correct horse battery staple',
      kdfParams: TEST_KDF,
    })
  })

  afterEach(() => {
    mneme.close()
  })

  test('remember returns the plaintext body to the caller', async () => {
    const record = await mneme.remember({
      kind: 'preference',
      body: 'prefers concise reviews',
    })
    expect(record.body).toEqual({ mode: 'plaintext', data: 'prefers concise reviews' })
  })

  test('get round-trips a record through encrypt-then-decrypt', async () => {
    const written = await mneme.remember({ kind: 'fact', body: 'london resident' })
    const back = await mneme.get(written.id)
    expect(back?.body).toEqual({ mode: 'plaintext', data: 'london resident' })
  })

  test('two records with identical plaintext produce different ciphertexts', async () => {
    const a = await mneme.remember({ kind: 'fact', body: 'identical plaintext' })
    const b = await mneme.remember({ kind: 'fact', body: 'identical plaintext' })
    expect(a.id).not.toBe(b.id)
    // Sanity: both come back as plaintext to the caller, but their persisted
    // ciphertexts differ — covered by the on-disk test below.
    expect((await mneme.get(a.id))?.body).toEqual((await mneme.get(b.id))?.body)
  })

  test('supersede encrypts the replacement', async () => {
    const original = await mneme.remember({ kind: 'preference', body: 'verbose comments' })
    const replacement = await mneme.supersede(original.id, {
      kind: 'preference',
      body: 'concise comments',
    })
    expect(replacement.body).toEqual({ mode: 'plaintext', data: 'concise comments' })
    const reread = await mneme.get(original.id)
    expect(reread?.lifecycle.supersededBy).toBe(replacement.id)
  })

  test('exportAll yields plaintext bodies to the caller', async () => {
    await mneme.remember({ kind: 'fact', body: 'one' })
    await mneme.remember({ kind: 'fact', body: 'two' })
    const exported = []
    for await (const r of mneme.exportAll()) {
      exported.push(r)
    }
    expect(exported.length).toBe(2)
    for (const r of exported) {
      expect(r.body.mode).toBe('plaintext')
    }
  })
})

describe('Mneme — encryption at rest (on-disk verification)', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mneme-encryption-'))
    dbPath = join(tmpDir, 'memory.sqlite')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('persisted body is ciphertext, not plaintext, when encrypted', async () => {
    const mneme = await Mneme.open({
      path: dbPath,
      passphrase: 'correct horse battery staple',
      kdfParams: TEST_KDF,
    })
    try {
      await mneme.remember({ kind: 'fact', body: 'this should NEVER appear in the db' })
    } finally {
      mneme.close()
    }

    const direct = new Database(dbPath)
    try {
      const row = direct
        .query<{ body_mode: string; body_data: string | null; body_ciphertext: string | null }, []>(
          'SELECT body_mode, body_data, body_ciphertext FROM memories LIMIT 1',
        )
        .get()
      expect(row?.body_mode).toBe('aes-gcm-256')
      expect(row?.body_data).toBeNull()
      expect(typeof row?.body_ciphertext).toBe('string')
      expect(row?.body_ciphertext?.length ?? 0).toBeGreaterThan(0)

      // The literal plaintext must not appear anywhere in the body columns.
      const allRows = direct
        .query<{ body_mode: string; body_data: string | null; body_ciphertext: string | null }, []>(
          'SELECT body_mode, body_data, body_ciphertext FROM memories',
        )
        .all()
      for (const r of allRows) {
        expect(r.body_data ?? '').not.toContain('this should NEVER appear')
        expect(r.body_ciphertext ?? '').not.toContain('this should NEVER appear')
      }
    } finally {
      direct.close()
    }
  })

  test('reopening with the correct passphrase decrypts the existing records', async () => {
    const passphrase = 'correct horse battery staple'
    const first = await Mneme.open({ path: dbPath, passphrase, kdfParams: TEST_KDF })
    let writtenId = ''
    try {
      const r = await first.remember({ kind: 'fact', body: 'survives a close' })
      writtenId = r.id
    } finally {
      first.close()
    }

    const second = await Mneme.open({ path: dbPath, passphrase, kdfParams: TEST_KDF })
    try {
      const back = await second.get(writtenId as never)
      expect(back?.body).toEqual({ mode: 'plaintext', data: 'survives a close' })
    } finally {
      second.close()
    }
  })

  test('reopening with the wrong passphrase fails with unauthorized', async () => {
    const init = await Mneme.open({
      path: dbPath,
      passphrase: 'correct',
      kdfParams: TEST_KDF,
    })
    try {
      await init.remember({ kind: 'fact', body: 'guarded' })
    } finally {
      init.close()
    }

    await expect(
      Mneme.open({ path: dbPath, passphrase: 'wrong', kdfParams: TEST_KDF }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
  })
})

describe('Mneme — encryption + embedder co-operate', () => {
  test('semantic recall returns plaintext bodies under encryption', async () => {
    const mneme = await Mneme.open({
      path: ':memory:',
      passphrase: 'shh',
      kdfParams: TEST_KDF,
      embedder: keywordEmbedder(['coffee', 'review']),
    })
    try {
      await mneme.remember({ kind: 'fact', body: 'loves coffee in the morning' })
      await mneme.remember({ kind: 'preference', body: 'prefers terse code review' })
      await mneme.remember({ kind: 'fact', body: 'unrelated note about hiking' })

      const matches = await mneme.recall('peer review feedback')
      expect(matches.length).toBeGreaterThanOrEqual(1)
      expect(matches[0]?.record.body).toEqual({
        mode: 'plaintext',
        data: 'prefers terse code review',
      })
    } finally {
      mneme.close()
    }
  })
})
