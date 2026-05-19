import { describe, expect, test } from 'bun:test'
import {
  MEMORY_KINDS,
  MemoryIdSchema,
  MemoryKindSchema,
  MemoryRecordSchema,
  MnemeError,
  OwnerIdSchema,
  PROTOCOL_VERSION,
  PayloadSchema,
} from './index'

const VALID_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

describe('protocol version', () => {
  test('exposes a string identifier', () => {
    expect(typeof PROTOCOL_VERSION).toBe('string')
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('MemoryIdSchema', () => {
  test('accepts a valid ULID', () => {
    expect(() => MemoryIdSchema.parse(VALID_ULID)).not.toThrow()
  })

  test('rejects a malformed identifier', () => {
    expect(() => MemoryIdSchema.parse('not-a-ulid')).toThrow()
    expect(() => MemoryIdSchema.parse('')).toThrow()
    expect(() => MemoryIdSchema.parse('01ARZ3NDEKTSV4RRFFQ69G5FAv')).toThrow() // lowercase
  })
})

describe('OwnerIdSchema', () => {
  test('accepts a non-empty string under 256 chars', () => {
    expect(() => OwnerIdSchema.parse('pedro@example.com')).not.toThrow()
  })

  test('rejects empty and oversized identifiers', () => {
    expect(() => OwnerIdSchema.parse('')).toThrow()
    expect(() => OwnerIdSchema.parse('x'.repeat(257))).toThrow()
  })
})

describe('MemoryKindSchema', () => {
  test('all enumerated kinds round-trip', () => {
    for (const kind of MEMORY_KINDS) {
      expect(MemoryKindSchema.parse(kind)).toBe(kind)
    }
  })

  test('rejects unknown kinds', () => {
    expect(() => MemoryKindSchema.parse('chitchat')).toThrow()
  })
})

describe('PayloadSchema', () => {
  test('accepts plaintext payload', () => {
    const parsed = PayloadSchema.parse({ mode: 'plaintext', data: 'hello' })
    expect(parsed.mode).toBe('plaintext')
  })

  test('accepts encrypted payload', () => {
    const parsed = PayloadSchema.parse({
      mode: 'aes-gcm-256',
      ciphertext: 'abc',
      nonce: 'def',
      wrappedKey: 'ghi',
    })
    expect(parsed.mode).toBe('aes-gcm-256')
  })

  test('rejects unknown payload mode', () => {
    expect(() => PayloadSchema.parse({ mode: 'rot13', data: 'hello' })).toThrow()
  })
})

describe('MemoryRecordSchema', () => {
  const baseRecord = {
    id: VALID_ULID,
    ownerId: 'pedro',
    kind: 'preference',
    body: { mode: 'plaintext', data: 'Prefers concise responses' },
    metadata: {
      createdAt: '2026-05-19T12:00:00.000Z',
      sourceApp: 'claude-code',
    },
    lifecycle: {},
  }

  test('parses a minimal valid record', () => {
    const parsed = MemoryRecordSchema.parse(baseRecord)
    expect(String(parsed.id)).toBe(VALID_ULID)
    expect(parsed.kind).toBe('preference')
  })

  test('rejects records with invalid embedding values', () => {
    expect(() =>
      MemoryRecordSchema.parse({
        ...baseRecord,
        embedding: [0.1, Number.POSITIVE_INFINITY, 0.3],
      }),
    ).toThrow()
  })

  test('rejects confidence outside [0, 1]', () => {
    expect(() =>
      MemoryRecordSchema.parse({
        ...baseRecord,
        metadata: { ...baseRecord.metadata, confidence: 1.5 },
      }),
    ).toThrow()
  })

  test('accepts a supersededBy reference to another ULID', () => {
    const parsed = MemoryRecordSchema.parse({
      ...baseRecord,
      lifecycle: { supersededBy: VALID_ULID },
    })
    expect(String(parsed.lifecycle.supersededBy)).toBe(VALID_ULID)
  })
})

describe('MnemeError', () => {
  test('carries its code and preserves cause', () => {
    const cause = new Error('underlying')
    const err = new MnemeError('storage_failure', 'disk full', { cause })
    expect(err.code).toBe('storage_failure')
    expect(err.message).toBe('disk full')
    expect(err.cause).toBe(cause)
    expect(MnemeError.is(err)).toBe(true)
    expect(MnemeError.is(new Error('other'))).toBe(false)
  })
})
