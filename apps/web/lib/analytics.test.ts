import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { hashVisitor, refererHost } from './analytics'

describe('refererHost', () => {
  test('returns null for missing referer', () => {
    expect(refererHost(null)).toBeNull()
    expect(refererHost(undefined)).toBeNull()
    expect(refererHost('')).toBeNull()
  })

  test('strips path + query, keeps only host', () => {
    expect(refererHost('https://news.ycombinator.com/item?id=12345')).toBe('news.ycombinator.com')
    expect(refererHost('https://twitter.com/somebody/status/123?token=abc')).toBe('twitter.com')
    expect(refererHost('https://github.com/ppserapiao/mneme/tree/main')).toBe('github.com')
  })

  test('returns null for malformed URLs (we never crash on bad referer)', () => {
    expect(refererHost('not a url')).toBeNull()
    expect(refererHost('//example.com')).toBeNull()
  })
})

describe('hashVisitor', () => {
  const originalSalt = process.env.ANALYTICS_SALT

  beforeEach(() => {
    process.env.ANALYTICS_SALT = 'test-salt-do-not-use-in-prod'
  })
  afterEach(() => {
    if (originalSalt === undefined) Reflect.deleteProperty(process.env, 'ANALYTICS_SALT')
    else process.env.ANALYTICS_SALT = originalSalt
  })

  test('throws if ANALYTICS_SALT is unset (fail-loud at config time)', () => {
    Reflect.deleteProperty(process.env, 'ANALYTICS_SALT')
    expect(() => hashVisitor('1.2.3.4', 'test-ua')).toThrow(/ANALYTICS_SALT not configured/)
  })

  test('returns a 64-char hex sha256', () => {
    const h = hashVisitor('1.2.3.4', 'test-ua')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  test('same inputs same day produce the same hash (so unique-visitor dedup works)', () => {
    expect(hashVisitor('1.2.3.4', 'ua-1')).toBe(hashVisitor('1.2.3.4', 'ua-1'))
  })

  test('different IPs produce different hashes', () => {
    expect(hashVisitor('1.2.3.4', 'ua')).not.toBe(hashVisitor('5.6.7.8', 'ua'))
  })

  test('different UAs produce different hashes', () => {
    expect(hashVisitor('1.2.3.4', 'chrome')).not.toBe(hashVisitor('1.2.3.4', 'firefox'))
  })

  test('different salts produce different hashes (rotating ANALYTICS_SALT invalidates prior dedup)', () => {
    const h1 = hashVisitor('1.2.3.4', 'ua')
    process.env.ANALYTICS_SALT = 'a-different-salt-value'
    const h2 = hashVisitor('1.2.3.4', 'ua')
    expect(h1).not.toBe(h2)
  })
})
