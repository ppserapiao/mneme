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
