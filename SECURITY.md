# Security policy

mneme is privacy infrastructure. Cryptographic correctness, encryption at rest, signed writes, and the boundary between what the client sees and what any future server sees are all load-bearing — see [`ARCHITECTURE.md` §10](./ARCHITECTURE.md) for the threat model. We take security reports seriously and respond fast.

---

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.** We use GitHub's private vulnerability reporting + email.

### Preferred: GitHub Private Vulnerability Reporting

1. Open [https://github.com/ppserapiao/mneme/security/advisories/new](https://github.com/ppserapiao/mneme/security/advisories/new).
2. Fill in the form. Include reproduction steps, the affected versions, and impact assessment.
3. We receive an immediate notification.

### Fallback: email

If you can't use GitHub's reporting tool, email **`security@mneme.dev`**. (Until that domain is wired, also CC `ptengelmann@gmail.com`.) Use a subject line that includes `[mneme security]` so it isn't lost in noise.

### What to include

- A clear description of the vulnerability + impact (confidentiality / integrity / availability)
- Steps to reproduce (proof-of-concept code is welcome)
- Affected package and version range (e.g. `@mnemehq/sdk` `<= 0.1.2`)
- Any suggested mitigation
- Whether you're happy to be credited publicly when the advisory is published

---

## Our commitment

| Severity | Initial response | Patch released within |
| --- | --- | --- |
| **Critical** (RCE, key disclosure, plaintext memory leak from a sealed store, unauthenticated sync access) | ≤ 24 hours | ≤ 7 days |
| **High** (auth bypass, signed-write forgery, cross-owner data exposure) | ≤ 48 hours | ≤ 14 days |
| **Medium** (DoS, partial information disclosure with no key material) | ≤ 5 days | ≤ 30 days |
| **Low** (defence-in-depth, hardening) | ≤ 14 days | Next minor release |

We publish a GitHub Security Advisory for every confirmed vulnerability once a patch is available, and credit the reporter unless they prefer anonymity.

---

## Scope

### In scope

- All published `@mnemehq/*` packages on npm
- The reference implementation at [`packages/sdk`](./packages/sdk) and downstream
- The MCP server at [`apps/mcp-server`](./apps/mcp-server)
- The WebSocket transport at [`packages/sync-websocket`](./packages/sync-websocket)
- The encryption envelope (`@mnemehq/sdk` crypto subpath) — see [ADR 0005](./decisions/0005-encryption-envelope-v0-3.md) and [ADR 0006](./decisions/0006-recovery-phrase-and-signed-writes.md)
- The mneme.dev landing page

### Out of scope (for now)

- The unreleased Mneme Cloud — when it ships, the scope expands. Reports on a not-yet-public surface should be queued for Cloud GA.
- Third-party adapters (e.g. competitor distillers under `tests/eval/competitors/`) — report those upstream.
- Issues that require physical access to a user's unlocked device and the device's keychain (out-of-band threat model)
- Social-engineering attacks against the user (handing over their recovery phrase to a phishing site, etc.)

---

## Disclosure policy

- We follow **coordinated disclosure**: a fix lands in a patched release before public details are published.
- The maximum embargo is **90 days from initial report**. After that, we publish the advisory regardless of patch status. (We've never come close to needing the full window.)
- Reporters who follow this policy are eligible for public credit in the Security Advisory and in the changelog of the patched release.

---

## What "secure by design" means in mneme today

We're explicit about what mneme already gets right and where the current threat model is still evolving. This matters because the project is in public beta (`v0.1.x`) and acquiring a reputation for honest cryptographic engineering is part of the strategy.

### Already in place (v0.1.x, public beta)

- **AES-256-GCM at rest** for every memory body — see `EncryptedPayload` in `@mnemehq/protocol`
- **Argon2id KDF** with sensible default parameters (`DEFAULT_KDF_PARAMS` in `@mnemehq/sdk`)
- **Per-record data keys** wrapped by the user's master key (envelope encryption)
- **Ed25519 signed writes** — every memory cryptographically proves it came from the owner
- **BIP-39 24-word recovery phrase** — shown once on `Mneme.initialize()`, never stored by mneme
- **SAS-verified multi-device pairing** — short authentication string both devices must confirm; defends against MITM during the master-key transfer
- **`bun:sqlite` raw-read tested** — our smoke test (`bun run smoke` scenario 3) confirms zero plaintext leaks for sealed stores

### Known limitations (documented, on the published roadmap)

- **Embedding leakage to any future hosted backend**: in the v0–v1 threat model the server holds plaintext embedding vectors so it can return top-K matches for a query. The server cannot read memory bodies, but it can infer semantic clusters. The mitigation path (LSH + PIR in v2, Trusted Execution Environments in v3) is documented in [`ARCHITECTURE.md` §10](./ARCHITECTURE.md).
- **No bearer-token auth on the WebSocket transport (v0.0.x)**: LAN-only with loud warnings. Auth lands with Mneme Cloud (v0.2.x).
- **No TLS at the transport layer (v0.0.x)**: caller's responsibility today (reverse proxy). TLS ships with Cloud.
- **No pairing revocation yet**: a compromised pairing can't currently be revoked without rotating the master key (which means re-pairing every device). Revocation + key rotation is a planned ADR.
- **No third-party security audit yet**: we plan to commission one before the v0.2 Mneme Cloud GA. Reports will be published.

---

## Cryptographic primitives

mneme uses well-reviewed primitives via [`libsodium`](https://doc.libsodium.org/) for client-side work. No hand-rolled crypto. No custom protocols.

- **Symmetric encryption**: AES-256-GCM (NIST-standard authenticated encryption)
- **Key derivation**: Argon2id (winner of the 2015 Password Hashing Competition)
- **Signing**: Ed25519 (NIST SP 800-186 curve, fast and audit-friendly)
- **Recovery phrase**: BIP-39 (Bitcoin Improvement Proposal 39 — the recovery-seed standard)

If you find a cryptographic issue — incorrect parameter choice, weak default, misuse of a primitive — that is the highest-priority class of report. We treat them as Critical or High by default and respond accordingly.

---

## Past advisories

None published yet. mneme is in public beta and reaches enough surface area that responsible disclosure is genuinely valuable. If you find one, we'd rather hear from you than from a CVE database.

---

*This policy is permanent and revised in lockstep with the project. Material changes will reference a corresponding ADR.*
