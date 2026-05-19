# 0005 — Encryption envelope (v0.0.3)

**Status**: Accepted
**Date**: 2026-05-19

## Context

The protocol spec (`docs/protocol/v0.1.md` §3.3) defines `Payload.mode = "aes-gcm-256"` as the production-mode body. v0.0.1 and v0.0.2 of the SDK shipped plaintext-at-rest only — sufficient for local development, but every additional day in that state weakens the structural promise of the brand (*"your memory, your keys, every model"*). The whole differentiation collapses if a third party demos mneme and finds the SQLite file contains readable text.

This ADR locks the v0.0.3 encryption envelope in: the cipher choice, key-derivation parameters, on-disk format, and the deliberately deferred pieces (recovery phrase, signed writes, multi-device wrapping).

The work is constrained by four forces:

1. **The protocol already commits us to AES-256-GCM** (`mode: 'aes-gcm-256'` with `ciphertext`, `nonce`, `wrappedKey`, optional `aad` fields, all base64url). Implementing anything else would require a protocol bump.
2. **No external native crypto deps.** `onnxruntime-node` already taught us that native addons interact badly with Bun's cleanup (ADR 0004 §4). The Web Crypto API ships with Bun and Node 18+ and exposes AES-GCM natively — zero new bindings.
3. **Single-line developer ergonomics.** Encryption-on must remain `await Mneme.open({ passphrase })`. We cannot afford a multi-step ceremony in the v0.0.3 quickstart.
4. **Scope discipline.** Recovery phrase, signed writes, multi-device key wrapping, and key rotation each deserve their own ADR. Shipping any of them in this PR would push the encryption ship date by weeks and dilute review.

## Decision

### Cipher and KDF choices

- **Body encryption: AES-256-GCM** via `globalThis.crypto.subtle`. 96-bit random nonce per record, 128-bit GCM tag.
- **AAD binds the record id**, so a ciphertext cannot be swapped between two records without the GCM tag check failing. Stored as base64url in the `aad` field.
- **Per-record data keys**: a fresh 256-bit random key per record (`crypto.getRandomValues`). Wrapped under the master key using AES-256-GCM (envelope encryption).
- **Master key derivation: Argon2id** via `@noble/hashes` (audited, pure JS, ~50 KB). Defaults follow OWASP 2024+ recommendations for interactive use:
  - Memory: 64 MiB (`memoryKiB = 65 536`)
  - Iterations: 3
  - Parallelism: 4 lanes
  - Output: 32 bytes (256 bits)
- **Verifier**: on first init we encrypt a known constant (`mneme-master-key-verifier-v1`) under the freshly derived master key and persist the ciphertext. On subsequent opens we re-derive and attempt to decrypt the verifier; a wrong passphrase fails fast before any record is touched.

### On-disk format

A new `crypto_metadata` SQLite table (one row, `id = 1`) stores:

```
salt                BLOB    16 random bytes
verifier_ciphertext BLOB    AES-GCM ciphertext of the verifier constant
verifier_nonce      BLOB    96-bit GCM nonce for the verifier
kdf_algorithm       TEXT    'argon2id' (fixed in v0.0.3, extensible later)
kdf_memory_kib      INTEGER persisted KDF params (the row's values win on reopen)
kdf_iterations      INTEGER ditto
kdf_parallelism     INTEGER ditto
kdf_output_length   INTEGER ditto
created_at          TEXT    ISO-8601
```

Per-record bodies in the `memories` table store `body_mode = 'aes-gcm-256'`, with `body_ciphertext`, `body_nonce`, `body_wrapped_key`, and `body_aad` as base64url strings. The plaintext `body_data` column is `NULL` in encrypted records.

The `wrappedKey` protocol field is a single string, so we pack the wrap's nonce (12 bytes, fixed) and ciphertext together as `nonce || ciphertext` before base64url-encoding. Unpacking is unambiguous because the nonce length is fixed.

### Developer API

Plaintext mode keeps the sync constructor (`new Mneme()`) — no breaking change for existing v0.0.2 users. Encrypted mode requires the async factory:

```ts
const mneme = await Mneme.open({ passphrase: 'correct horse battery staple' })
```

The sync constructor explicitly **throws** when a passphrase is provided, with a message pointing at `Mneme.open()`. This prevents the silent footgun of "I passed a passphrase but nothing is encrypted." Wrong passphrase on reopen surfaces as `MnemeError` with code `unauthorized`.

The caller always sees plaintext bodies in returned `MemoryRecord`s; encryption is internal to the store. The only way to observe encryption-at-rest is by opening the SQLite file directly (covered by `encryption.test.ts`).

### Search interaction

When encrypted, the FTS5 trigger does not index ciphertext (the trigger condition is `body_mode = 'plaintext'`). Lexical recall on an encrypted store therefore returns empty results — documented in the SDK README. Semantic recall via an embedder still works because embeddings are computed pre-encryption and stored in plaintext (the documented MVP leakage from `ARCHITECTURE.md` §5).

## Consequences

Positive:

- The brand promise becomes implementable, not aspirational. `Mneme.open({ passphrase })` produces a store where the SQLite file contains no readable user data.
- No new native dependencies. Web Crypto + `@noble/hashes` keeps install size small and survives Bun's runtime quirks.
- The protocol spec is now exercised end-to-end: every field on the `aes-gcm-256` payload mode has a producing and consuming code path covered by tests.
- Embedder + encryption co-operate cleanly — the most ergonomic combination (`new LocalEmbedder()` + `passphrase`) gives semantic search over encrypted memory in one call.

Negative:

- **No recovery phrase.** A lost passphrase is a permanently lost store. This is loaded loudly in the SDK README and `MnemeOptions.passphrase` doc comment, but it is a real footgun until v0.0.4 ships the BIP-39 recovery flow.
- **No signed writes.** The protocol's `signature` field is still optional in v0.1; signed Ed25519 writes land alongside the recovery phrase in v0.0.4.
- **Single-device only.** Master key derivation is from passphrase alone; device-key augmentation, multi-device pairing, and key wrapping for additional devices are all deferred to the sync ADR (v0.2).
- **Lexical recall is silently empty under encryption.** Tests cover this, but a user who turns on encryption without an embedder will see `recall()` return `[]` and may be confused. We will add an explicit error in v0.0.4.
- **First-write latency:** Argon2id with 64 MiB / 3 iterations takes ~200–500 ms on consumer hardware. Acceptable for a one-time `open()`; not for hot paths (which never re-derive).

## Alternatives considered

- **Sodium / XChaCha20-Poly1305.** Equally strong, ARCHITECTURE.md namechecks libsodium. Rejected for v0.0.3 because the protocol spec already locked AES-256-GCM; switching ciphers requires a protocol bump and would invalidate any future implementation that ships AES-GCM only.
- **`onnxruntime-style` native crypto via `node-sodium`.** Native addon brings exactly the kind of Bun cleanup crash we documented in ADR 0004. Web Crypto avoids the dependency entirely.
- **Per-store single master key, no per-record data keys.** Simpler but breaks the protocol's `wrappedKey` field semantics and prevents future per-record key rotation. Stuck with envelope encryption.
- **Shipping recovery phrase in this PR.** Tempting because "forgot passphrase = data lost" is a real product gap. Deferred to keep the PR reviewable; the cleanest split is "envelope first, key management second."
- **Storing the passphrase in OS keychain.** Future work — adds a device key augmentation layer on top of the passphrase. Out of scope for the envelope itself.
- **Making `new Mneme({ passphrase })` async via a hidden init.** Considered; rejected as a footgun (async work hidden behind a sync constructor produces confusing error traces). Explicit `Mneme.open()` is honest about the asynchrony.
