#!/usr/bin/env bun
/**
 * Opens the alice.sqlite file with raw bun:sqlite (bypassing the SDK
 * entirely) and asserts that no row's body column contains the plaintext
 * substrings we wrote. If the encryption envelope ever regresses, the
 * substrings will appear on disk and this fails.
 */
import { Database } from 'bun:sqlite'

const storePath = process.env.MNEME_SMOKE_STORE_PATH
if (!storePath) {
  process.stderr.write('MNEME_SMOKE_STORE_PATH not set\n')
  process.exit(2)
}

// Known plaintext from lifecycle.ts — every one of these is body content
// the user wrote. If we find any of them in the raw sqlite blob, the at-rest
// encryption guarantee has been violated.
const KNOWN_PLAINTEXT = [
  'single-origin coffee',
  'London, prefers cycling',
  'Ted Chiang',
  'Cixin Liu',
  'Brick Lane',
  'Sarah replies',
]

type MemoryRow = {
  id: string
  body_mode: string
  body_data: string | null
  body_ciphertext: string | null
  metadata_json: string | null
}
const db = new Database(storePath, { readonly: true })
const rows = db
  .query<MemoryRow, []>(
    'SELECT id, body_mode, body_data, body_ciphertext, metadata_json FROM memories',
  )
  .all()

// Concatenate every column that could plausibly contain payload bytes. If
// the encryption envelope ever regresses, plaintext will land in body_data
// (the only column that's allowed to hold plaintext, and ONLY when the user
// opted out of encryption — which we didn't).
const plaintextLeaks: string[] = []
for (const row of rows) {
  const haystack = [row.body_mode, row.body_data, row.body_ciphertext, row.metadata_json]
    .filter((s): s is string => typeof s === 'string')
    .join('\n')
  // The schema is healthy when body_mode is 'aes-gcm-256' (encrypted) and
  // body_data is NULL. If body_mode is 'plaintext', that's the encryption
  // contract being violated.
  if (row.body_mode !== 'aes-gcm-256') {
    plaintextLeaks.push(`row ${row.id}: body_mode is "${row.body_mode}", expected "aes-gcm-256"`)
    continue
  }
  for (const needle of KNOWN_PLAINTEXT) {
    if (haystack.includes(needle)) {
      plaintextLeaks.push(`row ${row.id}: contains "${needle}" in raw columns`)
    }
  }
}

db.close()

process.stdout.write(`${JSON.stringify({ rowCount: rows.length, plaintextLeaks })}\n`)
