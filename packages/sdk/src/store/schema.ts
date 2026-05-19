/**
 * v1 SQLite schema for the local Mneme store.
 *
 * Design notes:
 * - Body fields are denormalized from the protocol's discriminated `Payload`
 *   so each mode's columns can be queried directly. The full payload is
 *   reconstructed in the SqliteStore on read.
 * - Lifecycle timestamps are columns AND duplicated in `lifecycle_json` so we
 *   can index on them without losing structural fidelity.
 * - FTS5 indexes only plaintext bodies — ciphertext is opaque to lexical search
 *   by design. Semantic search over encrypted bodies arrives with embeddings
 *   in a later SDK version.
 */
export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL,
  kind            TEXT NOT NULL,

  body_mode       TEXT NOT NULL,
  body_data       TEXT,
  body_ciphertext TEXT,
  body_nonce      TEXT,
  body_wrapped_key TEXT,
  body_aad        TEXT,

  embedding       BLOB,
  metadata_json   TEXT NOT NULL,
  lifecycle_json  TEXT NOT NULL,
  signature       TEXT,

  created_at      TEXT NOT NULL,
  superseded_by   TEXT,
  expires_at      TEXT,
  forget_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_owner_kind
  ON memories (owner_id, kind);

CREATE INDEX IF NOT EXISTS idx_memories_owner_created
  ON memories (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_owner_active
  ON memories (owner_id)
  WHERE superseded_by IS NULL AND forget_at IS NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id UNINDEXED,
  owner_id UNINDEXED,
  body_data,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS memories_fts_insert
  AFTER INSERT ON memories
  WHEN NEW.body_mode = 'plaintext'
BEGIN
  INSERT INTO memories_fts (id, owner_id, body_data)
  VALUES (NEW.id, NEW.owner_id, NEW.body_data);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_delete
  AFTER DELETE ON memories
BEGIN
  DELETE FROM memories_fts WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS crypto_metadata (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  salt                BLOB    NOT NULL,
  verifier_ciphertext BLOB    NOT NULL,
  verifier_nonce      BLOB    NOT NULL,
  kdf_algorithm       TEXT    NOT NULL DEFAULT 'argon2id',
  kdf_memory_kib      INTEGER NOT NULL,
  kdf_iterations      INTEGER NOT NULL,
  kdf_parallelism     INTEGER NOT NULL,
  kdf_output_length   INTEGER NOT NULL,
  created_at          TEXT    NOT NULL
);
`
