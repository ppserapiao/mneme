# 0009 — Multi-device pairing ceremony

**Status**: Accepted
**Date**: 2026-05-19

## Context

v0.0.6 shipped a working sync engine — two `Mneme` instances now converge to identical state via any `SyncPeer` implementation. The engine, however, assumes both peers already share the same master key. For encrypted stores, "how does device B obtain the same master key as device A" is the missing structural piece — ADR 0008 §4 deliberately deferred it to this ADR.

This ADR specifies the **pairing ceremony**: the cryptographic protocol that transfers a master key from an already-set-up device A to a fresh device B, over an untrusted channel, such that:

1. An eavesdropper on the channel cannot derive the master key.
2. A man-in-the-middle on the channel is caught by user-verified comparison of a short authentication string (SAS) shown on both devices.
3. The protocol is replay-safe — the same pairing payload cannot be re-used to obtain the master key a second time.
4. Device B ends up with its own keyring (its own passphrase, its own recovery phrase) wrapping the same master key bytes that device A holds.

Pairing has its own crypto considerations distinct from the envelope (ADR 0005) and the dual-wrapping recovery model (ADR 0006), and warrants a dedicated decision document.

## Decision

### Cryptographic primitives

- **X25519 ECDH** for ephemeral key agreement. From `@noble/curves/ed25519.js` (already a dependency). Ephemeral keys are generated per-pairing-session and discarded after use.
- **HKDF-SHA256** to derive both a session key (32 bytes, used to encrypt the master key bundle) and the SAS (4 bytes → 6 decimal digits) from the shared secret. Domain-separated by distinct `info` strings.
- **AES-256-GCM** to encrypt the master key bundle, keyed by the session key. Authenticated; tampering with the bundle ciphertext aborts the transfer.

### Three-message handshake

```
Device A (paired, has master key K)        Device B (fresh, no keyring yet)
═══════════════════════════════════         ═══════════════════════════════════

(1) Generate ephemeral X25519 keypair (a_priv, a_pub).
    Generate sessionId (ULID).
    Compute expiresAt = now + 5 minutes.
    Build PairingInvite = { sessionId, pubA: a_pub, expiresAt }.

      ─── invite ─────────────────────►

                                          (2) Validate now < expiresAt.
                                          (3) Generate ephemeral X25519 (b_priv, b_pub).
                                          (4) shared = X25519(b_priv, pubA).
                                          (5) sessionKey = HKDF(shared, info="mneme-pairing-v1-session", 32B).
                                              sas       = HKDF(shared, info="mneme-pairing-v1-sas", 4B).
                                              sas → first 6 decimal digits.
                                          (6) Display SAS, prompt user to verify
                                              it matches the SAS on device A.
                                          (7) Build PairingResponse = { sessionId, pubB: b_pub }.

      ◄─── response ───────────────────

(8) shared = X25519(a_priv, pubB).
(9) sessionKey, sas = (same derivation as B).
(10) Display SAS, prompt user to verify
     it matches device B's display.
     ── USER VERIFIES BOTH MATCH ──
(11) If confirmed:
     nonce = random(12)
     encryptedMasterKey = AES-256-GCM(K, sessionKey, nonce, aad=sessionId)
     Build PairingTransferBundle = { sessionId, encryptedMasterKey, nonce }.

      ─── transfer bundle ────────────►

                                          (12) Validate bundle.sessionId matches.
                                          (13) Decrypt encryptedMasterKey with
                                               sessionKey + nonce + aad=sessionId.
                                               (Auth-tag mismatch ⇒ abort.)
                                          (14) Initialise local keyring with the
                                               transferred master key, B's passphrase,
                                               and a freshly-generated recovery phrase.
                                          (15) Return { mneme_B, recoveryPhrase_B }.
```

### SAS — length and verification

- **6 decimal digits** (≈20 bits). Short enough to read out over a phone call or compare on two screens; long enough that an active MITM would need to brute-force ~10⁶ ephemeral key trials to fake a matching SAS, with no replay channel because sessions expire in 5 minutes.
- The SAS is derived from the same shared secret on both sides. If a MITM has substituted their own public key into either direction, the two derived shared secrets will differ, the two SASes will differ, and the user catches it.
- README will recommend verification via a **side channel** the user trusts (in-person, voice call, signed Signal message) rather than the same channel the invite travelled through.

### Session expiry and replay protection

- `expiresAt` is `now + 5 minutes`, embedded in the invite, validated on every step.
- `sessionId` is a ULID generated by device A; device B echoes it in the response, device A echoes it in the bundle (as AEAD additional data).
- After a successful commit on device A, the ephemeral private key (a_priv) is discarded — even an attacker who later compromises device A's storage cannot recover the session key.
- Device B's `finalize` MAY refuse repeated calls with the same `sessionId`; v0.0.7 trusts the caller not to retry (one-shot API).

### Resulting state on device B

- Device B writes its keyring with `MasterKey.initialiseWith(transferredKey, passphraseB)`.
- That keyring carries:
  - Wrapping #1: master key under Argon2id(B's passphrase, B's salt)
  - Wrapping #2: master key under entropy of B's freshly-generated 24-word recovery phrase
- The signing keys derived from the master key are identical on A and B (HKDF is deterministic), so `mneme.publicKey` matches.
- B's recovery phrase is returned exactly once, like any fresh initialisation (ADR 0006).

### Transport boundary

The ceremony is **transport-agnostic**. The PairingInvite / PairingResponse / PairingTransferBundle are plain JSON-serialisable objects. v0.0.7 ships the ceremony logic; transports for moving the three messages between machines (QR code, WebSocket, hosted Cloud signaling) are implementations that ride on top. For tests and same-machine demos the three objects are passed through in-process call returns.

Documenting the file-based and QR transports is a v0.0.8 README enhancement; the cryptographic core is what locks now.

### Out of scope (tracked)

- **Pairing transports** (QR code, WebSocket signaling, hosted Cloud channel) — v0.0.8.
- **Multi-device caps** — a user can pair N devices; future enterprise tier may cap N.
- **Pairing revocation** — unpairing a device means dropping its sync state and rotating the master key. Master-key rotation is its own ADR (v0.1+).
- **Pairing attestation** (proving device A is a real mneme, not an attacker's pretender) — out of scope without a trust root; addressed when hosted Cloud lands and provides device registration.
- **Recovery from a partial pairing** — if B never finalises, A's session simply expires. No cleanup needed beyond expiry.

## Consequences

Positive:

- Two devices, **same encrypted store**, both unlockable with their own passphrase, both holding their own recovery phrase. The full "user-sovereign memory across devices" promise becomes implementable.
- Adding wrapping #2, #3, #N to device A's keyring is a separate (future) feature — we deliberately chose the simpler "B gets its own keyring" model rather than the "everyone shares device A's keyring" model. Cleaner, easier to reason about, no need to grow the `mneme_keyring` schema.
- The ceremony is transport-agnostic. Any messaging substrate the user trusts (Signal, email, QR, NFC, file copy) can carry the three messages.
- SAS verification gives meaningful MITM protection with a UX a non-technical user can follow: "compare these six digits on both screens."

Negative:

- The user has to verify the SAS. If they skip it, MITM is possible. Documentation must make this loud and unmissable.
- 6-digit SAS gives ~20 bits of MITM resistance, not 128. The 5-minute session window bounds the attack surface; a paranoid user can choose to verify the full base64 of `pubA` or `pubB` instead. README documents this.
- Device B does not get a copy of device A's recovery phrase — it gets its OWN. If the user loses both device A's passphrase AND device A's recovery phrase, but still has device B, they can re-pair from B to recover access. (This is a property, not a flaw — it's the right behaviour for independent device ownership.)
- Pairing is not yet automated over a single channel. v0.0.7 ships the ceremony as code; v0.0.8 wraps it in real transports.

## Alternatives considered

- **PAKE (SRP, OPAQUE, SPAKE2)** instead of X25519+SAS. Stronger cryptographically but introduces a heavier dep and a more complex protocol. SAS-verified ECDH is what Signal / WhatsApp / iMessage all use for safety-number verification — well-understood, widely-deployed, simpler. We can upgrade to a PAKE in a future ADR if real attacks against SAS schemes appear in our threat model.
- **Single-message "pairing token"** containing the master key wrapped under a printed password. Simpler but loses MITM protection — anyone who intercepts the printed token decrypts the master key. Rejected.
- **Pair via the recovery phrase** (type device A's recovery phrase on device B). Works structurally — same master key derivation — but exposes the recovery phrase to whatever channel the user types it through, defeating its "offline backup" purpose. The recovery phrase should never travel.
- **Have device B share device A's keyring entries directly** (add a wrapping for device B's key into A's `mneme_keyring`). Considered. Rejected for v0.0.7 because it grows the keyring schema (N wrappings instead of 2) and creates a per-device key management problem we don't have today. B getting its own keyring with the same master key is structurally cleaner; the keyrings happen to encrypt the same master key but they're independent records.
- **TOFU (trust on first use)** with no SAS. Acceptable if the user fully trusts the transport channel. Rejected as default because the brand thesis cannot promise "user-sovereign" while telling users to trust an unverified channel.
- **8-digit SAS instead of 6.** Stronger (~27 bits) but harder to read out aloud or compare visually without errors. 6 is the standard for OTP / pairing codes (iOS pairing, WhatsApp Web). README explicitly suggests verifying full public keys for users who want stronger guarantees.
