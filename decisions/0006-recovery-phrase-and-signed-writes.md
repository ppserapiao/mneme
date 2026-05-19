# 0006 — Recovery phrase and signed writes

**Status**: Accepted
**Date**: 2026-05-19
**Supersedes**: parts of ADR 0005 (master-key derivation)

## Context

ADR 0005 shipped the AES-256-GCM encryption envelope but left two structural promises unmet:

1. **No recovery path.** A lost passphrase meant a permanently lost store. We documented this loudly in the v0.0.3 SDK README, but it was a real footgun against the brand's "your memory belongs to you" promise — *if you can lose it, it doesn't fully belong to you*.
2. **No cryptographic provenance.** The protocol's `signature` field was specified but unused. Without it, *"any AI app citing a memory can verifiably prove the user wrote it"* (BRIEF.md) remained a promise of the spec, not a property of the implementation.

A third smaller gap was also worth closing in this PR: under encryption, calling `recall()` without an embedder silently returned `[]` because the FTS5 trigger does not index ciphertext. Documented, but confusing.

v0.0.4 closes all three.

## Decision

### Master key model — dual-wrapping

The master key is now a **random 256-bit value** (not derived from the passphrase). It is wrapped independently under two derived keys:

- **Passphrase wrapping**: AES-256-GCM with key = Argon2id(passphrase, passphraseSalt, kdfParams). Defaults unchanged from ADR 0005 (64 MiB / 3 iterations).
- **Recovery wrapping**: AES-256-GCM with key = the 32-byte entropy of a **24-word BIP-39 recovery phrase** (256 bits matches our AES-256 key).

Both wrappings unwrap the same master key. The user can unlock with either:

```ts
await Mneme.open({ passphrase: '…' })
await Mneme.open({ recoveryPhrase: '…' })
```

The recovery phrase is the user's offline backup of cryptographic root authority. The passphrase is what they type day to day. Losing both still loses the store; losing only one is recoverable.

This is the standard "two-factor recovery" model — 1Password Secret Keys, Apple iCloud Keychain Escrow, Signal PINs all rest on the same shape. Adding additional wrappings (new device, rotated passphrase, organisation escrow) is now a future extension that simply inserts another wrapping into the same keyring.

### Signed writes — Ed25519 via HKDF

The Ed25519 signing keypair is **deterministically derived** from the master key via HKDF-SHA256 with `info = "mneme-signing-v1"`. Same master key → same signing keys → same public key, regardless of whether the user unlocked with the passphrase or the recovery phrase. The public key is therefore a stable identifier for the store.

- On every encrypted write the SDK computes a canonical signing payload and signs it. The signature lands in the record's optional `signature` field.
- On every read the SDK recomputes the payload and verifies the signature against the public key. A tampered ciphertext (anything other than what was originally signed) raises `invalid_record` before the body is returned to the caller.
- Plaintext stores have no signing keys and write unsigned records — backwards-compatible with the v0.0.2 plaintext path.

**Canonical signing payload** (so external verifiers can recompute):

```
ownerId || \0 || id || \0 || createdAt || \0 || body.mode || \0 || body.content
```

where `body.content` is `body.data` for plaintext payloads and `body.ciphertext` for encrypted ones. The `\0` separator is safe because none of the four fields can contain a null byte (ULID, RFC 3339, fixed enum, base64url).

The signing private key is **never persisted** — it's re-derived from the master key on every unlock. This sidesteps a whole class of key-management bugs (where to store, how to wrap, when to rotate).

### Developer API — initialize / open split

v0.0.3 collapsed both fresh init and re-open into `Mneme.open({ passphrase })`. That hid the moment a recovery phrase is generated and made it impossible for the SDK to return it cleanly. v0.0.4 splits them:

```ts
// Fresh store — generates everything, returns the recovery phrase ONCE
const { mneme, recoveryPhrase } = await Mneme.initialize({ passphrase })

// Existing store — passphrase OR recovery phrase
const mneme = await Mneme.open({ passphrase })
const mneme = await Mneme.open({ recoveryPhrase })
```

- `Mneme.initialize` throws `conflict` if the keyring already exists.
- `Mneme.open` throws `record_not_found` if the keyring does not exist (with a pointer at `Mneme.initialize`).
- `Mneme.open` accepts at most one of `passphrase` / `recoveryPhrase` — both together raise `invalid_record`.
- `Mneme.publicKey` returns the base64url-encoded Ed25519 public key after unlock, or `undefined` for plaintext stores.

### Lexical recall under encryption — explicit error

Previously, `mneme.recall(query)` on an encrypted store with no embedder returned `[]` because the FTS5 trigger only indexes plaintext bodies. Now it raises `MnemeError({ code: 'unsupported_payload_mode' })` with the message *"lexical search (FTS5) cannot index ciphertext; pass an Embedder to enable semantic recall under encryption."* No silent confusion.

### Schema break — no auto-migration

The v0.0.3 keyring lived in `crypto_metadata` and stored a single passphrase-derived verifier. The v0.0.4 keyring lives in a new `mneme_keyring` table with the dual-wrapping shape. v0.0.4 explicitly does NOT migrate v0.0.3 stores — both schemas can coexist on disk (the old table is ignored) but `requireKeyringMeta` returns "no keyring" if `mneme_keyring` is empty.

We accept the break because the pre-v0.1.0 SDK has zero production users — only the founder's `:memory:` test stores. The release notes will instruct anyone with a v0.0.3 SQLite file to re-initialise. Auto-migration could be added later as a small helper but is not worth the cost today.

## Consequences

Positive:

- A user who forgets their passphrase has a paper backup that still works. The data is genuinely theirs.
- Every memory carries a cryptographic provenance trail — any third party with the store's public key can verify the record was written by the owner of that store. This is the foundation for the "agents can cite memory and prove the user wrote it" use case in the brief.
- The two-factor model generalises cleanly to multi-device (each device's key becomes another wrapping), passphrase rotation (replace the passphrase wrapping, leave recovery), and organisational escrow (an org-controlled wrapping alongside the user's). All of those are future ADRs but the data model is ready.
- `Mneme.publicKey` is now a stable identifier for a store — useful for the MCP server (each user advertises a public key when registering) and for future federation.
- Lexical-under-encryption is no longer a footgun.

Negative:

- API split is a real change. v0.0.3 callers of `Mneme.open({ passphrase })` against a fresh store now get `record_not_found` and must switch to `Mneme.initialize`. Documented in release notes and the SDK README.
- v0.0.3 stores are not auto-migrated. The decision is conservative ("re-init") for safety; the helper can come in v0.0.5 if anyone asks.
- Argon2id is run twice on first init (once for the passphrase wrapping, BIP-39 entropy is "free"). First-write latency rises ~10% — still well under a second on modern hardware.
- The signing key is HKDF-derived from the master key. Rotating the signing key requires rotating the master key, which requires re-encrypting every record. Future ADR; out of scope for v0.0.4.
- Holding the master key in memory after unlock is unchanged — we trust the runtime GC. Zeroing on close is a worthwhile follow-up.

## Alternatives considered

- **Recovery phrase IS the master key.** Tempting because there's only one secret to think about. Rejected: the passphrase becomes structurally awkward (do we derive from the phrase + extra entropy? what if the user wants to change passphrase without changing recovery?), and we can't add additional wrappings (devices, escrow) without breaking the model.
- **Random signing key, wrapped under master key.** More flexible (can rotate signing key without touching master) but adds a persisted secret and complicates the keyring schema. We can switch later if rotation requirements appear; deterministic derivation is the simpler default.
- **12-word BIP-39 phrase (128-bit entropy).** Half the security level. Rejected because our master key is 256-bit and the brief commits to acquirer-grade engineering — matching the entropy level removes a subtle weakness in the recovery path.
- **Auto-migrate v0.0.3 stores transparently.** Considered. Rejected for v0.0.4 because (a) zero production users so risk is purely engineering complexity for no user value, (b) it would entangle two crypto schemas in the open path. Helper utility deferred.
- **Sign the plaintext body instead of the persisted body.** Would mean external verifiers need to decrypt before verifying — defeats the point of letting third parties verify provenance without seeing contents. Signing the persisted form (ciphertext for encrypted records) is the correct choice.
- **Store the recovery phrase in OS keychain "for convenience."** The whole point of a recovery phrase is that it is OUT-of-band. We never persist it.
