import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type KdfParams, Mneme } from '@mnemehq/sdk'
import { WebSocketSyncPeer, WebSocketSyncServer, pairOverWebSocket, serveForPairing } from './index'

const TEST_KDF: KdfParams = {
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
  outputLength: 32,
}

// ----------------------------------------------------------------------------
// Sync over WebSocket
// ----------------------------------------------------------------------------

describe('WebSocket sync transport', () => {
  let alice: Mneme
  let bob: Mneme
  let server: WebSocketSyncServer

  beforeEach(() => {
    alice = new Mneme({ path: ':memory:', ownerId: 'pedro' })
    bob = new Mneme({ path: ':memory:', ownerId: 'pedro' })
    server = new WebSocketSyncServer({ mneme: alice, allowedOwnerId: 'pedro' })
    server.start()
  })

  afterEach(() => {
    server.stop()
    alice.close()
    bob.close()
  })

  test('one-way push: bob writes, alice receives via sync over ws://', async () => {
    const written = await bob.remember({ kind: 'fact', body: 'crossed the wire' })
    const peer = new WebSocketSyncPeer({ url: server.url })
    try {
      const result = await bob.sync(peer)
      expect(result.pushed).toBe(1)
      const onAlice = await alice.get(written.id)
      expect(onAlice?.body).toEqual({ mode: 'plaintext', data: 'crossed the wire' })
    } finally {
      peer.close()
    }
  })

  test('bidirectional convergence over ws://', async () => {
    await alice.remember({ kind: 'fact', body: 'a' })
    await bob.remember({ kind: 'fact', body: 'b1' })
    await bob.remember({ kind: 'fact', body: 'b2' })

    const peer = new WebSocketSyncPeer({ url: server.url })
    try {
      const result = await bob.sync(peer)
      expect(result.pushed).toBe(2)
      expect(result.pulled).toBe(1)
    } finally {
      peer.close()
    }

    const allOnAlice = []
    for await (const r of alice.exportAll()) allOnAlice.push(r)
    const allOnBob = []
    for await (const r of bob.exportAll()) allOnBob.push(r)
    expect(allOnAlice.length).toBe(3)
    expect(allOnBob.length).toBe(3)
  })

  test('idempotent: second sync over the same connection is a no-op', async () => {
    await alice.remember({ kind: 'fact', body: 'x' })
    const peer = new WebSocketSyncPeer({ url: server.url })
    try {
      await bob.sync(peer)
      const second = await bob.sync(peer)
      expect(second).toEqual({ pushed: 0, pulled: 0, merged: 0 })
    } finally {
      peer.close()
    }
  })

  test('ownerId enforcement: mismatched owner is rejected with unauthorized', async () => {
    const charlie = new Mneme({ path: ':memory:', ownerId: 'charlie' })
    try {
      const peer = new WebSocketSyncPeer({ url: server.url })
      try {
        await expect(charlie.sync(peer)).rejects.toMatchObject({ code: 'unauthorized' })
      } finally {
        peer.close()
      }
    } finally {
      charlie.close()
    }
  })

  test('server stop closes in-flight client cleanly', async () => {
    const peer = new WebSocketSyncPeer({ url: server.url })
    // Open by issuing one successful round-trip first.
    await bob.sync(peer)
    server.stop()
    // Subsequent sync should fail with storage_failure (connection closed).
    await expect(bob.sync(peer)).rejects.toMatchObject({ code: 'storage_failure' })
    peer.close()
  })
})

// ----------------------------------------------------------------------------
// Pairing over WebSocket
// ----------------------------------------------------------------------------

describe('WebSocket pairing transport', () => {
  let alice: Mneme
  let tmpDirB: string
  let bPath: string

  beforeEach(async () => {
    const init = await Mneme.initialize({
      path: ':memory:',
      ownerId: 'pedro',
      passphrase: 'alice-passphrase',
      kdfParams: TEST_KDF,
    })
    alice = init.mneme
    tmpDirB = mkdtempSync(join(tmpdir(), 'mneme-ws-pair-'))
    bPath = join(tmpDirB, 'b.sqlite')
  })

  afterEach(() => {
    alice.close()
    rmSync(tmpDirB, { recursive: true, force: true })
  })

  test('happy path: A serves; B pairs over ws://; both end up with the same publicKey', async () => {
    let urlForB = ''
    const aPromise = serveForPairing(alice, {
      onUrlReady: (url) => {
        urlForB = url
      },
      onSasReady: () => true, // user confirms on A
    })

    // Wait briefly for the server to bind and report its URL.
    while (urlForB === '') await new Promise<void>((r) => setTimeout(r, 10))

    const bResultPromise = pairOverWebSocket({
      url: urlForB,
      path: bPath,
      ownerId: 'pedro',
      passphrase: 'bob-passphrase',
      kdfParams: TEST_KDF,
      onSasReady: () => true, // user confirms on B
    })

    const [aResult, bResult] = await Promise.all([aPromise, bResultPromise])

    expect(aResult).toEqual({ paired: true })
    const { mneme: bob, recoveryPhrase } = bResult
    try {
      expect(bob.publicKey).toBe(alice.publicKey)
      expect(recoveryPhrase.trim().split(/\s+/).length).toBe(24)

      // After pairing, real sync over ws://: write on A, sync to B, B can read it.
      const server = new WebSocketSyncServer({ mneme: alice, allowedOwnerId: 'pedro' })
      server.start()
      try {
        const written = await alice.remember({
          kind: 'fact',
          body: 'paired-and-synced over the wire',
        })
        const peer = new WebSocketSyncPeer({ url: server.url })
        try {
          await bob.sync(peer)
        } finally {
          peer.close()
        }
        const onBob = await bob.get(written.id)
        expect(onBob?.body).toEqual({
          mode: 'plaintext',
          data: 'paired-and-synced over the wire',
        })
      } finally {
        server.stop()
      }
    } finally {
      bob.close()
    }
  })

  test('SAS rejection on B aborts the ceremony', async () => {
    let urlForB = ''
    const aPromise = serveForPairing(alice, {
      onUrlReady: (url) => {
        urlForB = url
      },
      onSasReady: () => true,
    })
    while (urlForB === '') await new Promise<void>((r) => setTimeout(r, 10))

    const bPromise = pairOverWebSocket({
      url: urlForB,
      path: bPath,
      passphrase: 'bob-passphrase',
      kdfParams: TEST_KDF,
      onSasReady: () => false, // user rejects on B
    })

    await expect(bPromise).rejects.toMatchObject({ code: 'unauthorized' })
    const aResult = await aPromise
    expect(aResult).toMatchObject({ paired: false })
  })

  test('SAS rejection on A aborts the ceremony with an error to B', async () => {
    let urlForB = ''
    const aPromise = serveForPairing(alice, {
      onUrlReady: (url) => {
        urlForB = url
      },
      onSasReady: () => false, // user rejects on A
    })
    while (urlForB === '') await new Promise<void>((r) => setTimeout(r, 10))

    const bPromise = pairOverWebSocket({
      url: urlForB,
      path: bPath,
      passphrase: 'bob-passphrase',
      kdfParams: TEST_KDF,
      onSasReady: () => true,
    })

    await expect(bPromise).rejects.toMatchObject({ code: 'unauthorized' })
    const aResult = await aPromise
    expect(aResult).toMatchObject({ paired: false })
  })

  test('plaintext Mneme cannot host a pairing endpoint', async () => {
    const plain = new Mneme({ path: ':memory:' })
    try {
      await expect(serveForPairing(plain, { onSasReady: () => true })).rejects.toMatchObject({
        code: 'invalid_record',
      })
    } finally {
      plain.close()
    }
  })
})
