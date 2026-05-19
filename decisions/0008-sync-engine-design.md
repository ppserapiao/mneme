# 0008 — Sync engine design

**Status**: Accepted
**Date**: 2026-05-19

## Context

`ARCHITECTURE.md` §4 calls multi-device sync "the load-bearing wall of our differentiation" — the engineering investment that Mem0 / Letta / Zep have not made and cannot make without rebuilding their architecture. v0.0.5 closed the single-device story (encryption, recovery, signed writes, Claude Code distribution). v0.0.6 has to open the multi-device story.

But "sync" is a wide design space. The honest version of this ADR locks in eight separate choices so the engine can be implemented and reviewed against a fixed contract:

1. **CRDT library or roll our own.** ARCHITECTURE.md §12 #1 left this open ("leaning Automerge"). Time to decide.
2. **Conflict resolution semantics** per field — what wins when two devices race?
3. **Transport** — how do records actually move between devices in v0.0.6?
4. **Pairing** — how does device B end up with the same master key as device A?
5. **Signature verification at the boundary** — does the receiver re-verify provenance?
6. **Incremental vs full sync** — does the catalog include everything or just changes since last sync?
7. **API shape** — what does `mneme.sync(...)` look like to a developer?
8. **What's deliberately out of scope** — and tracked for which future ADR.

This ADR resolves all eight.

## Decision

### 1. Roll our own grow-only set with per-field lifecycle merge

We do NOT use Yjs or Automerge in v0.0.6. Our data model is structurally simpler than what general-purpose CRDT libraries are built for:

- **Records are immutable**. `MemoryRecord` has a client-generated ULID, an immutable body, immutable metadata, and an Ed25519 signature. The body is never edited in place — "edits" produce a new record that supersedes the old one. There is therefore no within-record merge to do.
- **The only mutable state is the lifecycle envelope** (`supersededBy`, `expiresAt`, `forgetAt`) — three optional timestamps and one optional ID pointer. The conflict surface is tiny.
- **Operations are append-only**. Sync exchanges record sets that grow; nothing is ever removed from the wire (forgetting is just lifecycle).

A grow-only set with per-field LWW on the lifecycle envelope is a known-correct CRDT for exactly this shape. Yjs/Automerge would give us machinery for rich collaborative editing we don't need — at the cost of a heavier runtime, a larger surface area, and a less inspectable correctness story.

We reserve the right to swap in Automerge in a future ADR if our model changes (e.g., richer collaborative edits on memory bodies). For v0.0.6, the simpler engine fits the actual problem.

### 2. Conflict resolution per lifecycle field

- **`supersededBy: MemoryId`** — pick the entry whose target record has the **latest `metadata.createdAt`**. Both replacements are stored on disk regardless; only the pointer follows the latest one. Rationale: replacements are themselves valid memories — losing them would be data loss. The pointer is a UX convenience, not a record.
- **`expiresAt: ISOTimestamp`** — **earliest wins** (most aggressive expiry). Rationale: if device A says "expire 2027" and device B says "expire 2025," the user's strictest intent (expire sooner) wins. Honors the principle that forgetting is a real product feature (ARCHITECTURE.md §2).
- **`forgetAt: ISOTimestamp`** — **earliest wins**, same reasoning. Hard-delete schedule is also a strictness signal.
- **Concurrent writes** of the same record id by two devices: impossible in practice because IDs are ULIDs (96-bit timestamp + 80-bit randomness). Sync treats id collisions as `storage_failure` to be loud about a clock/randomness issue rather than silently merging two different records.

These rules are deterministic, commutative, and associative. Re-syncing two devices that have already converged is a no-op.

### 3. Transport — in-process peer for v0.0.6 only

v0.0.6 ships a `SyncPeer` TypeScript interface (transport-agnostic) and one concrete implementation: `InProcessSyncPeer`. That implementation wraps a `Mneme` instance so another `Mneme` can sync against it within the same process. Sufficient for unit tests, local demos, and for any consumer that wants to write its own transport (file-based, IPC, BLE, etc.).

WebSocket / HTTP / hosted Mneme Cloud sync targets are deliberately deferred to v0.0.7 (transport) and v0.1.0 (hosted backend). Building the engine first means the transport choice doesn't constrain the merge logic.

### 4. Pairing is deferred to v0.0.7

The sync engine assumes both peers share a master key. How device B obtains the same master key as device A — the "pairing ceremony" — is a separate concern and lives in its own ADR (0009 when we get there). For v0.0.6 testing, we use plaintext mode so the master key question doesn't apply. The engine works identically under encryption when keys match; pairing is what makes that match real.

### 5. No signature verification inside the sync engine

`@mneme/sdk`'s read path already verifies signatures via `verifyPersisted()` whenever a record is returned to the caller. Sync writes records via a dedicated `upsertForSync()` that bypasses signing (sync does not re-sign records — they are exchanged as-is). Later reads through the normal Mneme API surface re-verify signatures. So the sync engine itself does not need to verify; the layer ABOVE it (`get`/`recall`/`exportAll`) does.

This is a deliberate choice. Sync's job is to move bytes faithfully. Provenance verification belongs at the consumer boundary, where a tampering finding can be surfaced meaningfully (with the record's id, owner, and full lifecycle context).

A future ADR adds signature verification on RECEIVE for cross-key sync (records from a different owner who has shared with us) — that's a v0.0.8+ feature when we support cross-owner sharing.

### 6. Full catalog every time in v0.0.6 — incremental sync is v0.0.7

The peer's `catalog(ownerId)` returns every record's id and lifecycle digest (no body, no embedding, no metadata — just the minimum needed to diff). At memory-record counts realistic for v0.0.6 (≤10K records per owner) this is well under 1 MB. Optimising for larger sets via a `since` cursor and per-record-update timestamps is a v0.0.7 enhancement, gated behind real evidence (a user with > 10K records).

The full-catalog approach has one big payoff: it's idempotent and self-correcting. A device that crashed mid-sync resumes correctly without needing a stored "last sync timestamp" per peer.

### 7. API shape

```ts
class Mneme {
  /**
   * Pull every record from `peer` that this Mneme doesn't have, push every
   * record this Mneme has that the peer doesn't, and merge lifecycle for
   * records that exist on both. Returns a summary of the work done.
   */
  async sync(peer: SyncPeer): Promise<SyncResult>
}

interface SyncPeer {
  catalog(ownerId: OwnerId): Promise<SyncCatalog>
  fetch(ownerId: OwnerId, ids: ReadonlyArray<MemoryId>): Promise<ReadonlyArray<MemoryRecord>>
  push(ownerId: OwnerId, records: ReadonlyArray<MemoryRecord>): Promise<void>
}

type SyncCatalog = {
  entries: ReadonlyArray<SyncCatalogEntry>
}
type SyncCatalogEntry = {
  id: MemoryId
  createdAt: string
  lifecycle: MemoryLifecycle
}

type SyncResult = {
  pushed: number   // records sent to peer
  pulled: number   // records received from peer
  merged: number   // records that already existed on both, lifecycle merged
}

class InProcessSyncPeer implements SyncPeer { /* … */ }
```

The interface is intentionally small. A WebSocket transport in v0.0.7 implements the same three methods over JSON-RPC; a hosted Cloud transport in v0.1.0 implements them over HTTPS. The engine doesn't know or care.

### 8. Out of scope for v0.0.6 (and tracked)

- **Multi-device pairing ceremony** → ADR 0009 (v0.0.7)
- **WebSocket transport** → v0.0.7
- **HTTP transport / hosted Mneme Cloud** → v0.1.0
- **Signature verification at the sync boundary** → v0.0.8+ when cross-key sync exists
- **Incremental sync** (catalog cursor, change log table) → v0.0.7
- **Push notifications / live sync** → v0.2 with full sync engine
- **Cross-owner sharing** → v0.2+ (Share verb in protocol §6)
- **Cross-version sync** (protocol version mismatch handling) → covered by existing `protocol_version_mismatch` error code; full strategy when v0.2 spec lands

## Consequences

Positive:

- Two `Mneme` instances can converge to identical state today, through any transport a developer cares to wrap around the `SyncPeer` interface.
- The merge logic is small, deterministic, and pure. Easy to reason about; easy to test exhaustively.
- The engine is transport-agnostic — when the WebSocket and Cloud transports land, the engine doesn't change. Sync becomes one of those things where each new surface is cheap because the core was right.
- We do NOT ship a CRDT library to consumers who don't need one (every Yjs/Automerge install would pollute every SDK consumer). The `@noble/*` + `@scure/bip39` deps remain the SDK's only crypto-adjacent surface.
- Replacements are never lost on concurrent supersede — both records exist on disk after merge, addressable via `exportAll()` and (via the loser) `get(id)`. Pointer integrity is restored deterministically.

Negative:

- v0.0.6 demos require plaintext stores OR manually-aligned master keys across two devices. The "real" two-device flow has to wait for the pairing ADR.
- Full-catalog sync is O(N) over total records every sync. Fine at v0.0.6 scale; will need the incremental path before any sync user exceeds ~10K records.
- Earliest-wins on `expiresAt` / `forgetAt` is a strong stance — a user who deliberately extends expiry on one device cannot UNDO an earlier shorter expiry from another device by syncing. Future ADR can revisit with versioned lifecycle if this turns out to bite real users.
- No signature verification in the sync path means a malicious peer can push validly-shaped records with garbage signatures. The receiver's `get()` would later raise `invalid_record`, but the bad row sits in the DB until then. Acceptable for v0.0.6 (the only peers are the user's own devices) but a real concern when cross-owner sharing lands.

## Alternatives considered

- **Yjs / Automerge.** Both are excellent CRDT libraries for collaborative document editing. Our data model is structurally different — immutable records with a tiny lifecycle envelope — so the rich operation log they maintain is overhead, not value. We can switch later if our model gains richer collaborative edits; designed the engine to allow that without breaking the wire later.
- **Last-writer-wins for the whole record, not per-lifecycle-field.** Simpler but wrong: it would let one device's `supersededBy` overwrite another's, losing a valid replacement record. Per-field merge preserves all data.
- **Latest-wins on `expiresAt` / `forgetAt`.** Considered. Rejected because user intent leans toward strictness — if you ever asked something to be forgotten, syncing in a "no actually keep this" from another device feels like a violation. We can add an explicit "extend expiry" verb later if the constraint bites.
- **Skip the catalog, just push every record every sync.** Simpler still, but quadratic in bytes for the network. Catalog-then-fetch is the standard rsync-like dance and worth the slight engine complexity.
- **Ship pairing in the same PR.** Considered but rejected on scope. Pairing has its own crypto questions (channel choice, attestation, replay protection) and warrants its own ADR.
- **Make sync part of the `MnemeStore` protocol interface.** Rejected for v0.0.6. The protocol spec v0.1 does not define sync; we're going to specify the wire protocol in v0.2 once the engine is proven. Adding `MnemeStore.sync()` now would lock in a contract we haven't validated.

## Acceptance criteria for the v0.0.6 PR

The PR landing this ADR ships:

- `packages/sdk/src/sync/{peer,engine,lifecycle-merge}.ts`
- `Mneme.sync(peer)` public API
- `SqliteStore.catalog()` and `SqliteStore.upsertForSync()`
- An exhaustive test suite covering: convergence on one-way writes, bidirectional convergence, concurrent supersede (both replacements kept, pointer follows latest), concurrent forget (earliest wins), idempotent re-sync, owner isolation across sync, lifecycle round-trip through encrypted records (records that were encrypted at write-time stay encrypted on the peer's disk).
- A new SDK README section on sync.
- This ADR.

Pass criteria: every test green; sync.test.ts adds ≥10 tests; running sync twice in succession is a documented no-op.
