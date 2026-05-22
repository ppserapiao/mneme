# Mneme — Architecture

Authoritative technical design for the Mneme memory infrastructure. Read alongside `BRIEF.md` for product context and `CLAUDE.md` for working principles.

---

## 1. System overview

Mneme is a four-layer system, designed so each layer is replaceable, inspectable, and capable of becoming a standalone product.

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 4 — Surfaces                                          │
│  Consumer app · Browser extension · MCP server · IDE plugins │
│  Third-party apps (built by anyone on the SDK)               │
├──────────────────────────────────────────────────────────────┤
│  Layer 3 — SDKs                                              │
│  TypeScript SDK (primary) · Python SDK · OpenAPI for others  │
│  Verbs: write, read, search, observe, share, export, forget  │
├──────────────────────────────────────────────────────────────┤
│  Layer 2 — Core (the Mneme Protocol)                         │
│  Auth · Encryption envelope · Retrieval orchestration        │
│  Lifecycle (dedupe, supersede, decay, forget)                │
│  Sync engine (CRDT-based, multi-device)                      │
├──────────────────────────────────────────────────────────────┤
│  Layer 1 — Storage                                           │
│  Postgres + pgvector · S3 (encrypted blobs) · Redis (cache)  │
│  Append-only audit log · Signed write history                │
└──────────────────────────────────────────────────────────────┘
```

The boundary between Layer 2 and Layer 1 is the boundary we publish as the **Mneme Protocol** — a versioned, open spec. Anyone can implement Layer 1 themselves (self-host, or use someone else's backend) and still get the full Layer 2+ experience.

## 2. Data model

The unit of memory is a **MemoryRecord**. It is small, semantically rich, and immutable once written (mutation happens via supersedence, not edit).

```ts
type MemoryRecord = {
  id: string                    // ULID; client-generated
  ownerId: string               // user identifier (opaque to server)
  kind: MemoryKind              // see below
  body: EncryptedPayload        // ciphertext, server-opaque
  embedding: Vector             // server-visible, derived client-side
  metadata: {
    createdAt: ISOString
    sourceApp: string           // "claude-code", "chatgpt-web", etc.
    sourceContext?: string      // free-form, server-opaque (encrypted)
    confidence?: number         // 0–1, model-assigned
    tags?: string[]             // server-opaque (encrypted)
  }
  lifecycle: {
    supersededBy?: string       // ID of newer record that replaces this
    expiresAt?: ISOString       // soft expiry
    forgetAt?: ISOString        // hard delete schedule
  }
  signature: Ed25519Signature   // signed by owner's private key
}

type MemoryKind =
  | "fact"         // "Pedro is based in the UK"
  | "preference"   // "prefer TypeScript over Python"
  | "event"        // "shipped Mneme v0.1 on 2026-06-15"
  | "relationship" // "works with collaborator X"
  | "context"      // longer-form situational context
  | "skill"        // for agent use: learned procedural memory
```

**Design notes:**

- IDs are client-generated (ULIDs) so writes work offline.
- The `body` is encrypted with the user's key before it ever leaves the client. The server stores ciphertext only.
- The `embedding` is generated client-side and is the only semantic surface the server sees. This is the controlled leakage we accept in MVP (see §5).
- Writes are signed with the user's Ed25519 key. This gives us cryptographic provenance — any AI app citing a memory can verifiably prove the user wrote it.
- The lifecycle fields are first-class. Forgetting is a real product feature, not a delete button.

## 3. Storage architecture

Storage is two-tier and intentionally boring:

- **Hot storage**: Postgres (managed via Neon or Fly.io Postgres). Tables for `memories`, `users`, `devices`, `audit_log`. pgvector for embeddings. Indexed by `ownerId`, `kind`, and the HNSW vector index.
- **Blob storage**: S3-compatible (Cloudflare R2 for egress costs). Used for larger encrypted payloads (e.g., long-form contexts) that don't belong in the relational store. Referenced from `body` when payload exceeds 8KB.
- **Cache**: Redis for recently-retrieved encrypted blobs (5-minute TTL) and embedding lookup hot paths.
- **Audit log**: append-only, separate from main DB, exportable to user on demand. Records every read, write, and share — both to the user and any internal access.

Backups: continuous WAL archiving on Postgres, point-in-time restore. Blob storage is multi-region replicated. We commit to <1 hour RPO from day one.

## 4. Sync architecture (the local-first half)

This is the half that makes Mneme structurally different. The client is the source of truth; the server is one of several possible sync endpoints.

- **Local store**: SQLite on every device, mirroring the user's memory set. Reads happen locally; the network is only consulted for cross-device sync or cold-cache misses.
- **Sync protocol**: CRDT-based (last-writer-wins on supersedence chains, with vector clocks for conflict detection). The protocol is the same regardless of whether the sync server is Mneme Cloud, the user's self-hosted instance, or an iCloud/Dropbox shim.
- **Conflict handling**: Memories are append-only at the storage level; "edits" are new records that supersede old ones. This sidesteps most CRDT pain. Only the lifecycle fields can technically race, and we resolve those with deterministic precedence.
- **Offline-first**: Every write succeeds locally instantly. Sync happens in the background. The user never waits for the network for a memory operation.

This is the engineering investment that the competition has not made. It is the load-bearing wall of our differentiation.

## 5. Encryption model

We use **envelope encryption with client-held data keys**. The server never sees a memory body in plaintext.

- **Master key**: Argon2id-derived from the user's passphrase, augmented by a device key stored in OS keychain (macOS Keychain, iOS Secure Enclave, Windows DPAPI, Android Keystore).
- **Data keys**: Per-record AES-256-GCM. Wrapped by the user's master key. Stored alongside the ciphertext.
- **Signing key**: Ed25519, generated on first device. Used to sign every write. Public key registered with the server for verification.
- **Multi-device**: New devices are added via a verification ceremony (QR code with short-lived token). The master key is re-derived; data keys are re-wrapped to the new device's view.
- **Recovery**: 24-word BIP-39 recovery phrase, generated on first device, shown to user once. We don't store it. We don't have a "forgot password" link — that would be the back door we promise not to build.

### Searchable encryption: the honest tradeoff

End-to-end encryption + semantic search is the central technical tension. We are explicit about how we resolve it in stages:

- **MVP (v0–v1)**: Server holds embeddings (vectors) in plaintext for retrieval. Server holds memory bodies in ciphertext. Retrieval flow: client sends query embedding → server returns top-K matching encrypted blobs → client decrypts and re-ranks if needed. Leakage: server can infer semantic clusters but cannot read contents. Acceptable for launch and clearly communicated in our threat model.
- **v2 (post-PMF)**: Encrypted vector search via locality-sensitive hashing on the client + private information retrieval (PIR) techniques. Eliminates embedding leakage. Performance cost: ~2× slower retrieval.
- **v3 (enterprise tier)**: Trusted Execution Environments (AWS Nitro Enclaves, GCP Confidential Compute) for full encrypted-in-use retrieval. Server CPU sees plaintext only inside the enclave; we publish attestation reports. This becomes a differentiator for the enterprise SKU.

We will not pretend to have v3 cryptography on day one. We will document the v0 threat model clearly and improve it on a published roadmap.

## 6. The Mneme Protocol (the open spec)

Drafted in [`docs/protocol/`](./docs/protocol/) (v0.1, today). Versioned (semver). Vendor-neutral. Will move to a stable canonical URL when `mneme.dev` is provisioned.

The protocol defines:

- **The MemoryRecord schema** (canonical form)
- **The verb set**: `WRITE`, `READ`, `SEARCH`, `OBSERVE` (subscribe), `SHARE`, `EXPORT`, `FORGET`
- **The wire format** (JSON over HTTPS, plus a binary form for embedded contexts)
- **The auth handshake** (OAuth2 with PKCE + signed-request envelopes)
- **The MCP mapping** (how Mneme verbs map to Model Context Protocol tool calls)
- **Conformance tests** (a published test suite that implementations can run)

Why this matters: the protocol is the Trojan horse. If another player implements the protocol, they're already half-Mneme. If frontier labs eventually adopt it for portability, we're the reference implementation that defined the category.

## 7. API surface

Two surfaces, same protocol:

### REST (developer integrations)

```
POST   /v1/memories                  Write a memory
GET    /v1/memories/:id              Read a single memory
POST   /v1/search                    Semantic search
POST   /v1/observe                   Subscribe (Server-Sent Events)
DELETE /v1/memories/:id              Forget (soft)
POST   /v1/memories/:id/supersede    Replace with newer record
POST   /v1/export                    Bulk export (signed archive)
```

All requests:
- Authenticated via signed JWT (the signature is the user's Ed25519 over the request body)
- Returned with `Server-Timing` headers and trace IDs
- Rate-limited per-API-key with leaky-bucket
- Versioned via URL path; old versions supported for 18 months

### MCP server (Claude Code, Claude.ai, any MCP host)

Same verbs exposed as MCP tools (`mneme_write`, `mneme_search`, etc.). The MCP server is a thin shim over the SDK, distributed as a one-line install. Free. Best in class. The growth engine.

## 8. SDK design

Two first-class SDKs, generated from the same OpenAPI + protocol spec:

### TypeScript (primary)

```ts
import { Mneme } from "@mnemehq/sdk"

const mneme = new Mneme({ apiKey: process.env.MNEME_KEY })

await mneme.remember({
  kind: "preference",
  body: "Prefers concise code review comments",
  sourceApp: "my-app"
})

const matches = await mneme.recall("how does this user like feedback?", { limit: 5 })
```

Design principles:
- **Verbs that read like English** (`remember`, `recall`, `forget`) — wraps the protocol verbs in a more human-facing layer
- **Fully type-safe**: all inputs/outputs strongly typed, schemas exported
- **Zero-config local mode**: `new Mneme()` without an API key uses a local SQLite store; great for development
- **Streaming-first**: `recall` returns an async iterable so apps can render as results arrive
- **Privacy primitives in the API**: every call has optional scope and audit-tag parameters

### Python (secondary)

API-shape parity with TypeScript. Designed for AI/ML practitioners who'll be a big chunk of developer users.

### Other languages

Generated from OpenAPI: Go, Rust, Ruby, PHP. Lower priority. Ship when there's demand.

## 9. Hosted vs. open boundary

The protocol and SDK are **open source forever** (Apache 2.0). The hosted backend (Mneme Cloud) is **proprietary** and is what we charge for.

Open:
- Protocol spec
- TypeScript and Python SDKs
- Reference implementations of every Layer 1 component
- MCP server
- Conformance test suite
- Documentation

Proprietary:
- Mneme Cloud (multi-region, managed, SLA'd)
- Consumer app (binary; source not open but build process auditable)
- Browser extension (same)
- Enterprise control plane (RBAC, audit dashboards, compliance reports)

This is the "Postgres / Supabase" model: the engine is open, the managed service is what you pay for. It's been validated as a billion-dollar business shape.

## 10. Privacy and security posture

- **Threat model**: drafted in this file (see §5 and §11). Will move to a public, versioned page when `mneme.dev` is provisioned. Responsible-disclosure path is live now — see [`SECURITY.md`](./SECURITY.md).
- **Quarterly third-party security audits** from launch onward; reports published.
- **Bug bounty** via HackerOne from day one.
- **No tracking on consumer app or browser extension**. Crash reports are opt-in and scrubbed.
- **Account deletion is real deletion**, propagated to backups within 30 days, with a final cryptographic shred of the user's master key (rendering all encrypted blobs permanently unreadable regardless of where they exist).
- **Subpoena response policy** published. We commit to fighting overbroad requests and notifying users where legally permissible.
- **SOC2 Type 2** targeted for month 9; **ISO 27001** for month 18; **HIPAA-eligible** posture for the enterprise tier.

## 11. Observability and operations

- **Tracing**: OpenTelemetry → Honeycomb. Every request has an end-to-end trace including SDK-side spans.
- **Metrics**: per-endpoint P50/P95/P99 latency, error rate, saturation. Published on a public status page.
- **Product analytics**: PostHog, self-hosted. We never send identifiable analytics on consumer surfaces.
- **Logging**: structured JSON, retained 30 days for ops, 90 days for security.
- **Alerting**: PagerDuty for sev-1/sev-2, Slack for sev-3.
- **Deployment**: GitHub Actions → Fly.io. Every PR ships to a preview environment. Production deploys are one-click with instant rollback.

## 12. Open questions (decisions we will make as we go)

These are explicit unknowns to revisit, not omissions. Each will become an ADR in `decisions/` once resolved.

1. **CRDT library**: build on top of Yjs / Automerge / roll our own? Leaning Automerge for binary efficiency and Rust core.
2. **Embedding model**: Voyage AI to start. When do we evaluate on-device models (gte-small, all-MiniLM, Apple's on-device embeddings)?
3. **Per-app permission model**: do we expose granular per-app scopes from v1, or a single "trusted app" model?
4. **Pricing model for Mneme Cloud**: per-operation, per-MB, per-user? Leaning per-user with operation caps.
5. **Browser extension scope**: capture-everything by default, or explicit per-site opt-in? Leaning per-site for trust reasons.
6. **Standards body**: do we try to take the protocol to IETF, W3C, or the MCP working group? When?

## 13. What we are deliberately not building

Saying no is half the job. We are explicit:

- **Not building our own model.** We are model-agnostic infrastructure.
- **Not building a chat UI.** Mneme is not a chatbot. The consumer app surfaces memory; it does not converse.
- **Not building agent orchestration.** Memory is one primitive; orchestration is somebody else's category.
- **Not building analytics on user memory.** We have no business looking inside.
- **Not building a "free forever" hosted tier without limits.** Free tier exists; abuse limits exist.
- **Not building enterprise sales motion before product/market fit.** It's a trap.

## 14. The eight-week MVP timeline

(Mirrors the plan in `CLAUDE.md`; included here for technical clarity.)

| Week | Deliverable |
|---|---|
| 1 | Architecture finalized, repo skeleton, CI/CD, staging env on Fly.io |
| 2 | Core API: write, read, basic auth (WorkOS), Postgres + pgvector |
| 3 | Embedding pipeline (Voyage), semantic search v0, end-to-end localhost demo |
| 4 | TypeScript SDK alpha, 5-minute hello-world, docs site (Fumadocs) |
| 5 | Client-side encryption envelope, signed writes, recovery phrase flow |
| 6 | MCP server published, Claude Code install path, first integration partners |
| 7 | Design partner onboarding (target: 10 developers building real apps) |
| 8 | Public launch: open-source SDK on GitHub, hosted beta live, protocol v0.1 spec published, Show HN post |

---

*This document evolves with the system. Material changes go through ADRs in `decisions/`. Update the date below when changes are non-trivial.*

Last updated: 2026-05-19
