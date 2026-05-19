import { Database, type SQLQueryBindings } from 'bun:sqlite'
import {
  type EncryptedPayload,
  type ExportInput,
  type ForgetInput,
  type MemoryId,
  MemoryIdSchema,
  type MemoryLifecycle,
  type MemoryMetadata,
  type MemoryRecord,
  MemoryRecordSchema,
  MnemeError,
  type MnemeStore,
  type OwnerId,
  type Payload,
  type PlaintextPayload,
  type SearchInput,
  type SearchResult,
  type SupersedeInput,
  type WriteInput,
} from '@mneme/protocol'
import { ulid } from 'ulid'
import { cosineSimilarity } from '../embedder/cosine'
import type { Embedder } from '../embedder/types'
import { type Clock, systemClock } from '../util/clock'
import { ensureParentDir } from '../util/path'
import { SCHEMA_V1 } from './schema'

export type SqliteStoreOptions = {
  path: string
  clock?: Clock
  /**
   * Optional embedder. When provided, plaintext bodies are embedded on write
   * and `search` returns results ranked by cosine similarity against the query
   * embedding. Without an embedder, `search` falls back to SQLite FTS5 BM25.
   */
  embedder?: Embedder
}

type MemoryRow = {
  id: string
  owner_id: string
  kind: string
  body_mode: string
  body_data: string | null
  body_ciphertext: string | null
  body_nonce: string | null
  body_wrapped_key: string | null
  body_aad: string | null
  embedding: Uint8Array | null
  metadata_json: string
  lifecycle_json: string
  signature: string | null
  created_at: string
  superseded_by: string | null
  expires_at: string | null
  forget_at: string | null
}

export class SqliteStore implements MnemeStore {
  private readonly db: Database
  private readonly clock: Clock
  private readonly embedder: Embedder | undefined

  constructor(options: SqliteStoreOptions) {
    ensureParentDir(options.path)
    this.db = new Database(options.path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.clock = options.clock ?? systemClock
    this.embedder = options.embedder
    this.db.exec(SCHEMA_V1)
  }

  async write(input: WriteInput): Promise<MemoryRecord> {
    const now = this.clock.now()
    const id = MemoryIdSchema.parse(ulid(now.getTime()))
    const embedding = await this.embedIfPossible(input.body)
    const record = MemoryRecordSchema.parse({
      id,
      ownerId: input.ownerId,
      kind: input.kind,
      body: input.body,
      metadata: buildMetadata(input, now),
      lifecycle: {},
      ...(embedding ? { embedding } : {}),
    })
    this.insertRecord(record)
    return record
  }

  async read(ownerId: OwnerId, id: MemoryId): Promise<MemoryRecord | null> {
    const row = this.db
      .query<MemoryRow, [string, string]>(
        'SELECT * FROM memories WHERE owner_id = ? AND id = ? LIMIT 1',
      )
      .get(ownerId, id)
    if (!row) return null
    return rowToRecord(row)
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    if (this.embedder) {
      return this.semanticSearch(input, this.embedder)
    }
    return this.lexicalSearch(input)
  }

  private lexicalSearch(input: SearchInput): SearchResult[] {
    const limit = clampLimit(input.limit ?? 10)
    const nowIso = this.clock.now().toISOString()
    const ftsQuery = toFtsQuery(input.query)
    if (ftsQuery === null) return []

    const baseSql = `
      SELECT m.*, bm25(memories_fts) AS rank
      FROM memories m
      JOIN memories_fts fts ON fts.id = m.id
      WHERE memories_fts MATCH ?
        AND m.owner_id = ?
        AND m.superseded_by IS NULL
        AND (m.expires_at IS NULL OR m.expires_at > ?)
        AND (m.forget_at IS NULL OR m.forget_at > ?)
    `
    const kindFilter =
      input.kinds && input.kinds.length > 0
        ? ` AND m.kind IN (${input.kinds.map(() => '?').join(',')})`
        : ''
    const tail = ' ORDER BY rank ASC LIMIT ?'

    const params: SQLQueryBindings[] = [ftsQuery, input.ownerId, nowIso, nowIso]
    if (input.kinds) params.push(...input.kinds)
    params.push(limit)

    const rows = this.db
      .query<MemoryRow & { rank: number }, SQLQueryBindings[]>(baseSql + kindFilter + tail)
      .all(...params)

    return rows.map((row) => ({
      record: rowToRecord(row),
      // Convert SQLite BM25 (lower = better) to "higher = better" by negating.
      score: -row.rank,
    }))
  }

  private async semanticSearch(input: SearchInput, embedder: Embedder): Promise<SearchResult[]> {
    const limit = clampLimit(input.limit ?? 10)
    const nowIso = this.clock.now().toISOString()
    const queryVec = await embedder.embed(input.query)

    const kindFilter =
      input.kinds && input.kinds.length > 0
        ? ` AND m.kind IN (${input.kinds.map(() => '?').join(',')})`
        : ''

    const sql = `
      SELECT m.*
      FROM memories m
      WHERE m.owner_id = ?
        AND m.superseded_by IS NULL
        AND m.embedding IS NOT NULL
        AND (m.expires_at IS NULL OR m.expires_at > ?)
        AND (m.forget_at IS NULL OR m.forget_at > ?)
        ${kindFilter}
    `
    const params: SQLQueryBindings[] = [input.ownerId, nowIso, nowIso]
    if (input.kinds) params.push(...input.kinds)

    const rows = this.db.query<MemoryRow, SQLQueryBindings[]>(sql).all(...params)

    const ranked: SearchResult[] = []
    for (const row of rows) {
      if (!row.embedding) continue
      const candidateVec = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / 4,
      )
      if (candidateVec.length !== queryVec.length) continue
      const score = cosineSimilarity(queryVec, candidateVec)
      ranked.push({ record: rowToRecord(row), score })
    }
    ranked.sort((a, b) => b.score - a.score)
    return ranked.slice(0, limit)
  }

  async forget(input: ForgetInput): Promise<void> {
    const existing = await this.read(input.ownerId, input.id)
    if (!existing) {
      throw new MnemeError('record_not_found', `no memory ${input.id} for owner`)
    }
    const now = this.clock.now()
    const lifecycle: MemoryLifecycle = {
      ...existing.lifecycle,
      expiresAt: now.toISOString(),
      ...(input.hard ? { forgetAt: now.toISOString() } : {}),
    }
    this.db
      .prepare(
        `UPDATE memories
            SET lifecycle_json = ?, expires_at = ?, forget_at = ?
          WHERE owner_id = ? AND id = ?`,
      )
      .run(
        JSON.stringify(lifecycle),
        lifecycle.expiresAt ?? null,
        lifecycle.forgetAt ?? null,
        input.ownerId,
        input.id,
      )
  }

  async supersede(input: SupersedeInput): Promise<MemoryRecord> {
    const previous = await this.read(input.ownerId, input.supersededId)
    if (!previous) {
      throw new MnemeError('record_not_found', `no memory ${input.supersededId} to supersede`)
    }

    const now = this.clock.now()
    const newId = MemoryIdSchema.parse(ulid(now.getTime()))
    const embedding = await this.embedIfPossible(input.replacement.body)
    const replacement = MemoryRecordSchema.parse({
      id: newId,
      ownerId: input.replacement.ownerId,
      kind: input.replacement.kind,
      body: input.replacement.body,
      metadata: buildMetadata(input.replacement, now),
      lifecycle: {},
      ...(embedding ? { embedding } : {}),
    })
    const previousLifecycle: MemoryLifecycle = {
      ...previous.lifecycle,
      supersededBy: newId,
    }

    const tx = this.db.transaction(() => {
      this.insertRecord(replacement)
      this.db
        .prepare(
          `UPDATE memories
              SET lifecycle_json = ?, superseded_by = ?
            WHERE owner_id = ? AND id = ?`,
        )
        .run(JSON.stringify(previousLifecycle), newId, input.ownerId, input.supersededId)
    })
    tx()
    return replacement
  }

  async *export(input: ExportInput): AsyncIterable<MemoryRecord> {
    const since = input.since ?? '0000-01-01T00:00:00.000Z'
    const rows = this.db
      .query<MemoryRow, [string, string]>(
        `SELECT * FROM memories
          WHERE owner_id = ? AND created_at >= ?
          ORDER BY created_at ASC`,
      )
      .all(input.ownerId, since)
    for (const row of rows) {
      yield rowToRecord(row)
    }
  }

  close(): void {
    this.db.close()
  }

  /**
   * Embed a plaintext body when an embedder is configured. Returns undefined
   * for encrypted payloads (the embedder cannot see plaintext) or when no
   * embedder was provided.
   */
  private async embedIfPossible(body: Payload): Promise<number[] | undefined> {
    if (!this.embedder) return undefined
    if (body.mode !== 'plaintext') return undefined
    const vec = await this.embedder.embed(body.data)
    return Array.from(vec)
  }

  private insertRecord(record: MemoryRecord): void {
    const bodyCols = encodeBody(record.body)
    this.db
      .prepare(
        `INSERT INTO memories (
           id, owner_id, kind,
           body_mode, body_data, body_ciphertext, body_nonce, body_wrapped_key, body_aad,
           embedding, metadata_json, lifecycle_json, signature,
           created_at, superseded_by, expires_at, forget_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.ownerId,
        record.kind,
        bodyCols.mode,
        bodyCols.data,
        bodyCols.ciphertext,
        bodyCols.nonce,
        bodyCols.wrappedKey,
        bodyCols.aad,
        record.embedding ? encodeEmbedding(record.embedding) : null,
        JSON.stringify(record.metadata),
        JSON.stringify(record.lifecycle),
        record.signature ?? null,
        record.metadata.createdAt,
        record.lifecycle.supersededBy ?? null,
        record.lifecycle.expiresAt ?? null,
        record.lifecycle.forgetAt ?? null,
      )
  }
}

function buildMetadata(input: WriteInput, now: Date): MemoryMetadata {
  const meta: MemoryMetadata = {
    createdAt: now.toISOString(),
    sourceApp: input.metadata?.sourceApp ?? 'unknown',
  }
  if (input.metadata?.sourceContext !== undefined) meta.sourceContext = input.metadata.sourceContext
  if (input.metadata?.confidence !== undefined) meta.confidence = input.metadata.confidence
  if (input.metadata?.tags !== undefined) meta.tags = [...input.metadata.tags]
  return meta
}

type BodyColumns = {
  mode: string
  data: string | null
  ciphertext: string | null
  nonce: string | null
  wrappedKey: string | null
  aad: string | null
}

function encodeBody(body: Payload): BodyColumns {
  if (body.mode === 'plaintext') {
    return {
      mode: 'plaintext',
      data: body.data,
      ciphertext: null,
      nonce: null,
      wrappedKey: null,
      aad: null,
    }
  }
  return {
    mode: 'aes-gcm-256',
    data: null,
    ciphertext: body.ciphertext,
    nonce: body.nonce,
    wrappedKey: body.wrappedKey,
    aad: body.aad ?? null,
  }
}

function decodeBody(row: MemoryRow): Payload {
  if (row.body_mode === 'plaintext') {
    if (row.body_data === null) {
      throw new MnemeError('storage_failure', 'plaintext payload missing data column')
    }
    const payload: PlaintextPayload = { mode: 'plaintext', data: row.body_data }
    return payload
  }
  if (row.body_mode === 'aes-gcm-256') {
    if (row.body_ciphertext === null || row.body_nonce === null || row.body_wrapped_key === null) {
      throw new MnemeError('storage_failure', 'encrypted payload missing columns')
    }
    const payload: EncryptedPayload = {
      mode: 'aes-gcm-256',
      ciphertext: row.body_ciphertext,
      nonce: row.body_nonce,
      wrappedKey: row.body_wrapped_key,
    }
    if (row.body_aad !== null) payload.aad = row.body_aad
    return payload
  }
  throw new MnemeError('unsupported_payload_mode', `unknown body mode: ${row.body_mode}`)
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  const record = {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    body: decodeBody(row),
    metadata: JSON.parse(row.metadata_json) as MemoryMetadata,
    lifecycle: JSON.parse(row.lifecycle_json) as MemoryLifecycle,
    ...(row.embedding ? { embedding: decodeEmbedding(row.embedding) } : {}),
    ...(row.signature ? { signature: row.signature } : {}),
  }
  return MemoryRecordSchema.parse(record)
}

function encodeEmbedding(values: ReadonlyArray<number>): Uint8Array {
  const buf = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) {
    buf[i] = values[i] as number
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

function decodeEmbedding(bytes: Uint8Array): number[] {
  const view = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
  return Array.from(view)
}

/**
 * Convert a free-form natural language query into FTS5 syntax.
 *
 * The default match syntax in FTS5 is restrictive (e.g., punctuation is a
 * syntax error). We sanitize to a whitespace-separated OR of safe terms.
 * Returns null if no usable terms remain.
 */
function toFtsQuery(raw: string): string | null {
  const terms = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 32)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"`).join(' OR ')
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 10
  return Math.min(Math.floor(limit), 100)
}
