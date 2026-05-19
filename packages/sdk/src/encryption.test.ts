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
// minutes. The production default (64 MiB / 3 iterations) is exercised
// separately; the protocol semantics are independent of the cost.
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

describe('Mneme — constructor and factory contracts', () => {
  test('sync constructor refuses a passphrase', () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentionally passing a forbidden shape
    expect(() => new Mneme({ path: ':memory:', passphrase: 'oops' } as any)).toThrow(
      /Encrypted mode requires the async factory/i,
    )
  })

  test('sync constructor refuses a recoveryPhrase', () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentionally passing a forbidden shape
    expect(() => new Mneme({ path: ':memory:', recoveryPhrase: 'word ' } as any)).toThrow(
      /Encrypted mode requires the async factory/i,
    )
  })

  test('Mneme.open() without passphrase yields a plaintext instance', async () => {
    const mneme = await Mneme.open({ path: ':memory:' })
    try {
      expect(mneme.encrypted).toBe(false)
      expect(mneme.publicKey).toBeUndefined()
    } finally {
      mneme.close()
    }
  })

  test('Mneme.open rejects both passphrase and recoveryPhrase together', async () => {
    await expect(
      Mneme.open({
        path: ':memory:',
        passphrase: 'p',
        recoveryPhrase: 'r',
      }),
    ).rejects.toThrow(/not both/i)
  })

  test('Mneme.initialize requires a passphrase', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentionally omitting required field
    await expect(Mneme.initialize({ path: ':memory:' } as any)).rejects.toMatchObject({
      code: 'invalid_record',
    })
  })

  test('empty passphrase is rejected on initialize', async () => {
    await expect(
      Mneme.initialize({ path: ':memory:', passphrase: '', kdfParams: TEST_KDF }),
    ).rejects.toThrow(/passphrase must not be empty/i)
  })

  test('Mneme.open with passphrase fails when no keyring exists yet', async () => {
    await expect(Mneme.open({ path: ':memory:', passphrase: 'anything' })).rejects.toMatchObject({
      code: 'record_not_found',
    })
  })
})

describe('Mneme.initialize — fresh encrypted store', () => {
  test('returns a 24-word recovery phrase and an encrypted instance', async () => {
    const { mneme, recoveryPhrase } = await Mneme.initialize({
      path: ':memory:',
      passphrase: 'correct horse battery staple',
      kdfParams: TEST_KDF,
    })
    try {
      expect(mneme.encrypted).toBe(true)
      expect(typeof mneme.publicKey).toBe('string')
      const words = recoveryPhrase.trim().split(/\s+/)
      expect(words.length).toBe(24)
    } finally {
      mneme.close()
    }
  })

  test('initialize on an existing keyring throws conflict', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mneme-init-'))
    const dbPath = join(tmp, 'memory.sqlite')
    try {
      const { mneme: first } = await Mneme.initialize({
        path: dbPath,
        passphrase: 'one',
        kdfParams: TEST_KDF,
      })
      first.close()

      await expect(
        Mneme.initialize({ path: dbPath, passphrase: 'two', kdfParams: TEST_KDF }),
      ).rejects.toMatchObject({ code: 'conflict' })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('Mneme — encryption end-to-end', () => {
  let mneme: Mneme

  beforeEach(async () => {
    const { mneme: m } = await Mneme.initialize({
      path: ':memory:',
      ownerId: 'pedro',
      clock: frozenClock('2026-05-19T12:00:00.000Z'),
      passphrase: 'correct horse battery staple',
      kdfParams: TEST_KDF,
    })
    mneme = m
  })

  afterEach(() => {
    mneme.close()
  })

  test('remember returns the plaintext body to the caller', async () => {
    const record = await mneme.remember({ kind: 'preference', body: 'prefers concise reviews' })
    expect(record.body).toEqual({ mode: 'plaintext', data: 'prefers concise reviews' })
    expect(typeof record.signature).toBe('string')
  })

  test('get round-trips a record through encrypt-then-decrypt', async () => {
    const written = await mneme.remember({ kind: 'fact', body: 'london resident' })
    const back = await mneme.get(written.id)
    expect(back?.body).toEqual({ mode: 'plaintext', data: 'london resident' })
  })

  test('supersede encrypts and signs the replacement', async () => {
    const original = await mneme.remember({ kind: 'preference', body: 'verbose' })
    const replacement = await mneme.supersede(original.id, {
      kind: 'preference',
      body: 'concise',
    })
    expect(replacement.body).toEqual({ mode: 'plaintext', data: 'concise' })
    expect(typeof replacement.signature).toBe('string')
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

  test('lexical recall under encryption with no embedder throws', async () => {
    await mneme.remember({ kind: 'fact', body: 'searchable text' })
    await expect(mneme.recall('searchable')).rejects.toMatchObject({
      code: 'unsupported_payload_mode',
    })
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

  test('persisted body is ciphertext, never plaintext', async () => {
    const { mneme } = await Mneme.initialize({
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
      const rows = direct
        .query<{ body_mode: string; body_data: string | null; body_ciphertext: string | null }, []>(
          'SELECT body_mode, body_data, body_ciphertext FROM memories',
        )
        .all()
      expect(rows.length).toBe(1)
      for (const r of rows) {
        expect(r.body_mode).toBe('aes-gcm-256')
        expect(r.body_data).toBeNull()
        expect((r.body_ciphertext ?? '').length).toBeGreaterThan(0)
        expect(r.body_data ?? '').not.toContain('this should NEVER appear')
        expect(r.body_ciphertext ?? '').not.toContain('this should NEVER appear')
      }
    } finally {
      direct.close()
    }
  })

  test('reopen with the correct passphrase decrypts the existing records', async () => {
    const passphrase = 'correct horse battery staple'
    let writtenId = ''
    const { mneme: first } = await Mneme.initialize({
      path: dbPath,
      passphrase,
      kdfParams: TEST_KDF,
    })
    try {
      const r = await first.remember({ kind: 'fact', body: 'survives a close' })
      writtenId = r.id
    } finally {
      first.close()
    }

    const second = await Mneme.open({ path: dbPath, passphrase })
    try {
      const back = await second.get(writtenId as never)
      expect(back?.body).toEqual({ mode: 'plaintext', data: 'survives a close' })
    } finally {
      second.close()
    }
  })

  test('reopen with the wrong passphrase fails with unauthorized', async () => {
    const { mneme: init } = await Mneme.initialize({
      path: dbPath,
      passphrase: 'correct',
      kdfParams: TEST_KDF,
    })
    try {
      await init.remember({ kind: 'fact', body: 'guarded' })
    } finally {
      init.close()
    }

    await expect(Mneme.open({ path: dbPath, passphrase: 'wrong' })).rejects.toMatchObject({
      code: 'unauthorized',
    })
  })
})

describe('Mneme — BIP-39 recovery phrase', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mneme-recovery-'))
    dbPath = join(tmpDir, 'memory.sqlite')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('passphrase and recovery phrase unlock the same master key (same public key)', async () => {
    const { mneme: first, recoveryPhrase } = await Mneme.initialize({
      path: dbPath,
      passphrase: 'correct horse battery staple',
      kdfParams: TEST_KDF,
    })
    const publicKey = first.publicKey
    let writtenId = ''
    try {
      const r = await first.remember({ kind: 'fact', body: 'verifiable across unlocks' })
      writtenId = r.id
    } finally {
      first.close()
    }

    // Unlock with passphrase
    const viaPassphrase = await Mneme.open({
      path: dbPath,
      passphrase: 'correct horse battery staple',
    })
    try {
      expect(viaPassphrase.publicKey).toBe(publicKey)
      const back = await viaPassphrase.get(writtenId as never)
      expect(back?.body).toEqual({ mode: 'plaintext', data: 'verifiable across unlocks' })
    } finally {
      viaPassphrase.close()
    }

    // Unlock with recovery phrase
    const viaRecovery = await Mneme.open({ path: dbPath, recoveryPhrase })
    try {
      expect(viaRecovery.publicKey).toBe(publicKey)
      const back = await viaRecovery.get(writtenId as never)
      expect(back?.body).toEqual({ mode: 'plaintext', data: 'verifiable across unlocks' })
    } finally {
      viaRecovery.close()
    }
  })

  test('an invalid recovery phrase fails with unauthorized', async () => {
    const { mneme } = await Mneme.initialize({
      path: dbPath,
      passphrase: 'p',
      kdfParams: TEST_KDF,
    })
    mneme.close()

    await expect(
      Mneme.open({ path: dbPath, recoveryPhrase: 'not actually a bip39 phrase at all' }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
  })
})

describe('Mneme — signed writes', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mneme-signing-'))
    dbPath = join(tmpDir, 'memory.sqlite')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('every encrypted write carries an Ed25519 signature', async () => {
    const { mneme } = await Mneme.initialize({
      path: ':memory:',
      passphrase: 'p',
      kdfParams: TEST_KDF,
    })
    try {
      const r = await mneme.remember({ kind: 'fact', body: 'signed' })
      expect(typeof r.signature).toBe('string')
      expect((r.signature ?? '').length).toBeGreaterThan(0)
    } finally {
      mneme.close()
    }
  })

  test('plaintext writes carry no signature', async () => {
    const mneme = new Mneme({ path: ':memory:' })
    try {
      const r = await mneme.remember({ kind: 'fact', body: 'unsigned' })
      expect(r.signature).toBeUndefined()
    } finally {
      mneme.close()
    }
  })

  test('tampered ciphertext at rest is caught by signature verification on read', async () => {
    const { mneme, recoveryPhrase } = await Mneme.initialize({
      path: dbPath,
      passphrase: 'p',
      kdfParams: TEST_KDF,
    })
    let writtenId = ''
    try {
      const r = await mneme.remember({ kind: 'fact', body: 'protected' })
      writtenId = r.id
    } finally {
      mneme.close()
    }

    // Tamper: swap a single character in the ciphertext column directly.
    const direct = new Database(dbPath)
    try {
      const row = direct
        .query<{ body_ciphertext: string | null }, [string]>(
          'SELECT body_ciphertext FROM memories WHERE id = ?',
        )
        .get(writtenId)
      const original = row?.body_ciphertext ?? ''
      // Flip a base64url character somewhere in the middle.
      const mid = Math.floor(original.length / 2)
      const swapped = `${original.slice(0, mid)}${original[mid] === 'A' ? 'B' : 'A'}${original.slice(mid + 1)}`
      direct.prepare('UPDATE memories SET body_ciphertext = ? WHERE id = ?').run(swapped, writtenId)
    } finally {
      direct.close()
    }

    // Reopen with recovery (to confirm both unlock paths catch tampering).
    const reopen = await Mneme.open({ path: dbPath, recoveryPhrase })
    try {
      await expect(reopen.get(writtenId as never)).rejects.toMatchObject({
        code: 'invalid_record',
      })
    } finally {
      reopen.close()
    }
  })
})

describe('Mneme — encryption + embedder co-operate', () => {
  test('semantic recall returns plaintext bodies under encryption', async () => {
    const { mneme } = await Mneme.initialize({
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
