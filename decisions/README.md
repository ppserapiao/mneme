# Architecture Decision Records

Short, dated records of non-trivial architectural decisions. One file per decision, never edited after the status becomes `Accepted` (a superseding ADR is written instead).

## Format

Each ADR follows the [Michael Nygard lightweight template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

```
# NNNN — Short title

**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
**Date**: YYYY-MM-DD

## Context
What forces the decision.

## Decision
What we are doing.

## Consequences
Positive and negative outcomes.

## Alternatives considered
Briefly, with the reason each was rejected.
```

## Index

| #     | Title                                                 | Status   |
| ----- | ----------------------------------------------------- | -------- |
| 0001  | [Monorepo with Bun workspaces](./0001-monorepo-bun-workspaces.md) | Accepted |
| 0002  | [Local-first SDK before hosted API](./0002-local-first-sdk-before-hosted-api.md) | Accepted |
| 0003  | [Systematic operating procedure](./0003-systematic-operating-procedure.md) | Accepted |
| 0004  | [Local-first embedding strategy](./0004-local-first-embedding-strategy.md) | Accepted |
| 0005  | [Encryption envelope (v0.0.3)](./0005-encryption-envelope-v0-3.md) | Accepted (superseded in part by ADR 0006) |
| 0006  | [Recovery phrase and signed writes](./0006-recovery-phrase-and-signed-writes.md) | Accepted |
| 0007  | [MCP server design](./0007-mcp-server-design.md) | Accepted |
| 0008  | [Sync engine design](./0008-sync-engine-design.md) | Accepted |
| 0009  | [Multi-device pairing ceremony](./0009-multi-device-pairing-ceremony.md) | Accepted |
| 0010  | [WebSocket transport for sync and pairing](./0010-websocket-transport.md) | Accepted |
| 0011  | [npm publishing strategy](./0011-npm-publishing.md) | Accepted |
