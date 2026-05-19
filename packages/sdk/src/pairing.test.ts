import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KdfParams } from './crypto'
import { Mneme } from './index'
import {
  deriveSas,
  deriveSessionKey,
  deriveSharedSecret,
  generateEphemeralKeyPair,
} from './pairing/ceremony'

// Reduced Argon2id cost so the pairing tests don't pay the full 64 MiB / 3
// iterations on every initialise. The protocol semantics are independent of
// the cost.
const TEST_KDF: KdfParams = {
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
  outputLength: 32,
}

// ----------------------------------------------------------------------------
// Pure ceremony tests — exercise the cryptographic primitives in isolation.
// ----------------------------------------------------------------------------

describe('pairing ceremony — primitives (ADR 0009)', () => {
  test('ephemeral keypair has 32-byte private and public components', () => {
    const kp = generateEphemeralKeyPair()
    expect(kp.privateKey.length).toBe(32)
    expect(kp.publicKey.length).toBe(32)
  })

  test('ECDH agrees: both sides derive the same shared secret', () => {
    const a = generateEphemeralKeyPair()
    const b = generateEphemeralKeyPair()
    const sharedFromA = deriveSharedSecret(a.privateKey, b.publicKey)
    const sharedFromB = deriveSharedSecret(b.privateKey, a.publicKey)
    expect(Buffer.from(sharedFromA).equals(Buffer.from(sharedFromB))).toBe(true)
  })

  test('session key is 32 bytes (AES-256)', () => {
    const a = generateEphemeralKeyPair()
    const b = generateEphemeralKeyPair()
    const shared = deriveSharedSecret(a.privateKey, b.publicKey)
    expect(deriveSessionKey(shared).length).toBe(32)
  })

  test('SAS is a 6-digit decimal string and is deterministic for a given secret', () => {
    const a = generateEphemeralKeyPair()
    const b = generateEphemeralKeyPair()
    const shared = deriveSharedSecret(a.privateKey, b.publicKey)
    const sas = deriveSas(shared)
    expect(sas).toMatch(/^\d{6}$/)
    expect(deriveSas(shared)).toBe(sas)
  })

  test('SAS differs when the shared secret differs (MITM detection)', () => {
    const a = generateEphemeralKeyPair()
    const b = generateEphemeralKeyPair()
    const mitm = generateEphemeralKeyPair()
    const realShared = deriveSharedSecret(a.privateKey, b.publicKey)
    const mitmShared = deriveSharedSecret(a.privateKey, mitm.publicKey)
    expect(deriveSas(realShared)).not.toBe(deriveSas(mitmShared))
  })
})

// ----------------------------------------------------------------------------
// End-to-end pairing tests — real Mneme on both sides.
// ----------------------------------------------------------------------------

describe('Mneme.pairing — end-to-end ceremony', () => {
  let alice: Mneme
  let tmpDirB: string
  let bPath: string

  beforeEach(async () => {
    const init = await Mneme.initialize({
      path: ':memory:',
      passphrase: 'alice-passphrase',
      kdfParams: TEST_KDF,
    })
    alice = init.mneme
    tmpDirB = mkdtempSync(join(tmpdir(), 'mneme-pair-'))
    bPath = join(tmpDirB, 'b.sqlite')
  })

  afterEach(() => {
    alice.close()
    rmSync(tmpDirB, { recursive: true, force: true })
  })

  test('happy path: A pairs with B; both derive the same SAS, same publicKey, B gets own recovery phrase', async () => {
    const session = alice.beginPairing()
    const accepted = await Mneme.acceptPairing(session.invite)
    expect(accepted.sas).toMatch(/^\d{6}$/)

    const completed = await session.complete(accepted.response)
    expect(completed.sas).toBe(accepted.sas) // SAS matches — channel is verified

    // (User would compare SAS on both devices here. In tests we just assert
    // equality; in real life a non-matching SAS means abort.)

    const bundle = await completed.commit()
    const { mneme: bob, recoveryPhrase: bobRecovery } = await accepted.finalize(bundle, {
      path: bPath,
      ownerId: 'pedro',
      passphrase: 'bob-passphrase',
      kdfParams: TEST_KDF,
    })

    try {
      // Same publicKey on both sides — they wrap the same master key bytes,
      // so HKDF derives the same Ed25519 signing keypair.
      expect(bob.publicKey).toBe(alice.publicKey)
      // Bob got HIS OWN 24-word recovery phrase, not alice's.
      expect(bobRecovery.trim().split(/\s+/).length).toBe(24)
    } finally {
      bob.close()
    }
  })

  test('matched owners: A writes, syncs to B, B reads back the decrypted plaintext', async () => {
    // Re-initialise alice with explicit ownerId to match bob's.
    alice.close()
    const aliceInit = await Mneme.initialize({
      path: ':memory:',
      ownerId: 'pedro',
      passphrase: 'alice-passphrase',
      kdfParams: TEST_KDF,
    })
    alice = aliceInit.mneme

    const session = alice.beginPairing()
    const accepted = await Mneme.acceptPairing(session.invite)
    const completed = await session.complete(accepted.response)
    expect(completed.sas).toBe(accepted.sas)
    const bundle = await completed.commit()
    const { mneme: bob } = await accepted.finalize(bundle, {
      path: bPath,
      ownerId: 'pedro',
      passphrase: 'bob-passphrase',
      kdfParams: TEST_KDF,
    })

    try {
      expect(bob.publicKey).toBe(alice.publicKey)

      const written = await alice.remember({ kind: 'fact', body: 'paired memory works' })
      await alice.sync(bob.asPeer())
      const back = await bob.get(written.id)
      expect(back?.body).toEqual({ mode: 'plaintext', data: 'paired memory works' })
    } finally {
      bob.close()
    }
  })

  test('expired invite is rejected by B', async () => {
    const session = alice.beginPairing()
    const expiredInvite = { ...session.invite, expiresAt: '2020-01-01T00:00:00.000Z' }
    await expect(Mneme.acceptPairing(expiredInvite)).rejects.toMatchObject({
      code: 'protocol_version_mismatch',
    })
  })

  test('unsupported protocol version is rejected by B', async () => {
    const session = alice.beginPairing()
    const wrongVersion = { ...session.invite, version: 'mneme-pairing-v999' as never }
    await expect(Mneme.acceptPairing(wrongVersion)).rejects.toMatchObject({
      code: 'protocol_version_mismatch',
    })
  })

  test('SAS mismatch (simulated MITM substituting pubB) is caught by bundle auth-tag', async () => {
    const session = alice.beginPairing()
    const accepted = await Mneme.acceptPairing(session.invite)
    // Substitute a different pubB — as a MITM would. A computes a DIFFERENT
    // shared secret than B; the SAS displayed on A will not match B's, and
    // the user would refuse to commit. Even if the user mistakenly committed,
    // the bundle B receives is encrypted under A's session key (derived from
    // the wrong shared secret), so decryption fails on B's finalize().
    const mitmKP = generateEphemeralKeyPair()
    const tamperedResponse = {
      sessionId: accepted.response.sessionId,
      pubB: Buffer.from(mitmKP.publicKey).toString('base64url'),
    }
    const completed = await session.complete(tamperedResponse)
    expect(completed.sas).not.toBe(accepted.sas) // user would catch this visually
    const bundle = await completed.commit()
    await expect(
      accepted.finalize(bundle, {
        path: bPath,
        passphrase: 'bob-passphrase',
        kdfParams: TEST_KDF,
      }),
    ).rejects.toMatchObject({ code: 'invalid_record' })
  })

  test('mismatched sessionId on response is rejected by A', async () => {
    const session = alice.beginPairing()
    const accepted = await Mneme.acceptPairing(session.invite)
    const wrong = { ...accepted.response, sessionId: 'wrong-session' }
    await expect(session.complete(wrong)).rejects.toMatchObject({ code: 'invalid_record' })
  })

  test('mismatched sessionId on bundle is rejected by B', async () => {
    const session = alice.beginPairing()
    const accepted = await Mneme.acceptPairing(session.invite)
    const completed = await session.complete(accepted.response)
    const bundle = await completed.commit()
    const tamperedBundle = { ...bundle, sessionId: 'wrong-session' }
    await expect(
      accepted.finalize(tamperedBundle, {
        path: bPath,
        passphrase: 'bob-passphrase',
        kdfParams: TEST_KDF,
      }),
    ).rejects.toMatchObject({ code: 'invalid_record' })
  })

  test('a session cannot be committed twice (one-shot transfer)', async () => {
    const session = alice.beginPairing()
    const accepted = await Mneme.acceptPairing(session.invite)
    const completed = await session.complete(accepted.response)
    await completed.commit()
    await expect(completed.commit()).rejects.toMatchObject({ code: 'conflict' })
  })

  test('a session cannot be completed after commit', async () => {
    const session = alice.beginPairing()
    const accepted = await Mneme.acceptPairing(session.invite)
    const completed = await session.complete(accepted.response)
    await completed.commit()
    await expect(session.complete(accepted.response)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  test('pairing on a plaintext store is refused', () => {
    const plain = new Mneme({ path: ':memory:' })
    try {
      expect(() => plain.beginPairing()).toThrow(/encrypted store/i)
    } finally {
      plain.close()
    }
  })
})
