import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { type MemoryRecord, Mneme } from '@mneme/sdk'
import { makeHandlers } from './tools'

describe('MCP tool handlers — plaintext store', () => {
  let mneme: Mneme
  let handlers: ReturnType<typeof makeHandlers>

  beforeEach(() => {
    mneme = new Mneme({ path: ':memory:', ownerId: 'mcp-test' })
    handlers = makeHandlers(mneme)
  })

  afterEach(() => {
    mneme.close()
  })

  test('remember returns the stored record as JSON text content', async () => {
    const result = await handlers.remember({
      kind: 'preference',
      body: 'prefers concise responses',
      sourceApp: 'claude-code',
    })
    expect(result.isError).toBeUndefined()
    expect(result.content.length).toBe(1)
    expect(result.content[0]?.type).toBe('text')
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as MemoryRecord
    expect(parsed.kind).toBe('preference')
    expect(parsed.body).toEqual({ mode: 'plaintext', data: 'prefers concise responses' })
    expect(parsed.metadata.sourceApp).toBe('claude-code')
  })

  test('recall returns matches as JSON text content', async () => {
    await handlers.remember({ kind: 'fact', body: 'lives in london' })
    await handlers.remember({ kind: 'preference', body: 'enjoys terse feedback' })

    const result = await handlers.recall({ query: 'london' })
    const matches = JSON.parse(result.content[0]?.text ?? '[]') as Array<{
      record: MemoryRecord
      score: number
    }>
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches[0]?.record.body).toEqual({ mode: 'plaintext', data: 'lives in london' })
  })

  test('get returns the requested record or null', async () => {
    const written = await handlers.remember({ kind: 'fact', body: 'find me by id' })
    const writtenRecord = JSON.parse(written.content[0]?.text ?? '{}') as MemoryRecord

    const hit = await handlers.get({ id: writtenRecord.id })
    expect(JSON.parse(hit.content[0]?.text ?? 'null')).not.toBeNull()

    const miss = await handlers.get({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })
    expect(JSON.parse(miss.content[0]?.text ?? '')).toBeNull()
  })

  test('forget hides a record from recall', async () => {
    const written = await handlers.remember({ kind: 'fact', body: 'forget this please' })
    const id = (JSON.parse(written.content[0]?.text ?? '{}') as MemoryRecord).id

    const forgetResult = await handlers.forget({ id })
    expect(forgetResult.isError).toBeUndefined()
    const ack = JSON.parse(forgetResult.content[0]?.text ?? '{}') as { ok: boolean; id: string }
    expect(ack.ok).toBe(true)
    expect(ack.id).toBe(id)

    const recall = await handlers.recall({ query: 'forget this please' })
    const matches = JSON.parse(recall.content[0]?.text ?? '[]') as Array<unknown>
    expect(matches.length).toBe(0)
  })

  test('supersede returns the new record and links the old one', async () => {
    const original = await handlers.remember({ kind: 'preference', body: 'verbose comments' })
    const originalId = (JSON.parse(original.content[0]?.text ?? '{}') as MemoryRecord).id

    const replaced = await handlers.supersede({
      id: originalId,
      kind: 'preference',
      body: 'concise comments',
    })
    const newRecord = JSON.parse(replaced.content[0]?.text ?? '{}') as MemoryRecord
    expect(newRecord.body).toEqual({ mode: 'plaintext', data: 'concise comments' })

    const reread = await handlers.get({ id: originalId })
    const oldRecord = JSON.parse(reread.content[0]?.text ?? '{}') as MemoryRecord
    expect(oldRecord.lifecycle.supersededBy).toBe(newRecord.id)
  })

  test('export streams every record for the owner', async () => {
    await handlers.remember({ kind: 'fact', body: 'one' })
    await handlers.remember({ kind: 'fact', body: 'two' })
    await handlers.remember({ kind: 'fact', body: 'three' })

    const result = await handlers.export({})
    const all = JSON.parse(result.content[0]?.text ?? '[]') as MemoryRecord[]
    expect(all.length).toBe(3)
  })

  test('forget on a missing id returns an MCP-style error response', async () => {
    const result = await handlers.forget({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })
    expect(result.isError).toBe(true)
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      error: { code: string; message: string }
    }
    expect(payload.error.code).toBe('record_not_found')
  })
})
