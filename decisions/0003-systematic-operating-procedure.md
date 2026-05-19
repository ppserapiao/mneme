# 0003 — Systematic operating procedure

**Status**: Accepted
**Date**: 2026-05-19

## Context

Pedro is the founder and creative/product director; Claude is the technical co-founder doing the bulk of the implementation. Pedro is not deeply technical with git, GitHub, monorepo tooling, or release engineering, and he has explicitly delegated those workflows to Claude.

The brief commits us to acquirer-grade engineering from day one — sub-100ms P95 latency, SOC2-ready architecture, telemetry from the first commit. That posture cannot be maintained with ad-hoc operating habits: docs that drift, decisions that are made in chat but never recorded, brand voice that varies file-to-file, PRs without a defined shape, direct pushes to `main` when something feels urgent. Every one of those small drifts compounds over months until the repo no longer looks like the company we are trying to acquihire ourselves into.

Pedro's standing direction is therefore: *"everything has to be systematical."* That includes (his words) "make sure when you update memory, you make sure it always knows to check and update these documents as we go and as necessary… make sure it know how to systematically use github, and everything else."

There is no formal procedure document yet. CLAUDE.md describes principles ("ship daily", "documentation is product", "decisions get written down") but does not codify the operational machinery for keeping those principles true across sessions and contributors.

## Decision

Adopt the operating procedure documented in [`CLAUDE.md` → "Operating procedure (systematic — read every session)"](../CLAUDE.md) as the binding workflow for every change to this repository. The procedure covers five concrete sections:

1. **Doc–code lockstep.** A normative table mapping each kind of source change to the docs that must be updated in the same PR. No "I'll update docs later."
2. **GitHub workflow.** Default branch `main` with protection enabled. One branch per logical change, named `feat/<slug>` / `fix/<slug>` / `docs/<slug>` / `chore/<slug>` / `refactor/<slug>` / `brand/<slug>`. Conventional Commits format. One PR per logical change. PR body REQUIRES `Summary`, `Test plan`, and `Docs touched` sections. Squash-merge with branch deletion. Semver tags + GitHub Releases. Claude owns the `gh` CLI end-to-end.
3. **ADR discipline.** Every non-trivial decision (anything a future contributor would ask "why" about, anything changing a public surface) gets a numbered ADR in `decisions/` before or with the change. `decisions/README.md` index updated in the same PR.
4. **Quality gates.** `bun run lint`, `bun run --filter '*' typecheck`, and `bun test` MUST all pass locally before opening a PR and again before squashing. Hooks are never skipped.
5. **Brand on every public surface.** Every user-facing string follows `brand/README.md` voice rules. UI uses tokens from `brand/tokens.css` — never invent colours, fonts, radii, or spacing values.

The procedure is reinforced in two places:

- **`CLAUDE.md`** is the canonical source — loaded into every Claude Code session and visible to humans browsing the repo.
- **A `feedback` memory** (`feedback_systematic_operating_procedure.md`) pins the rule across Claude sessions and is listed first in `MEMORY.md` so it is read before any other entry.

`main` has GitHub branch protection enabled: PRs required, CI must pass, branch must be up-to-date with main, linear history enforced, force-pushes and deletions blocked, conversation resolution required. Admin bypass remains on so emergencies are not impossible.

## Consequences

Positive:

- The repository keeps the "acquirer/investor would drip their mouth" quality bar over time, not just at the moment of the initial commit.
- Every decision, brand change, protocol change, and architectural pivot is traceable: ADR + spec + code + docs, all moved together.
- Contributors (current and future) inherit a working contract, not folklore. New sessions start by reading `CLAUDE.md` and `MEMORY.md` and can act immediately without re-discovery.
- Pedro never has to manually drive git or GitHub; the workflow runs through `gh` CLI commands he can read and audit but does not have to author.

Negative:

- Process tax on every change, including trivial typo fixes — they still require a branch, PR, and squash-merge. Mitigated because the per-PR overhead is ~30 seconds via `gh`.
- Branch protection blocks emergency direct pushes by default; admin bypass exists but should be used only for genuine emergencies.
- The first time a procedure change is needed, it must itself follow the procedure (a new ADR superseding this one, plus an update to `CLAUDE.md`). This is desirable, not painful — it prevents drift.

## Alternatives considered

- **Document the rules informally in `CLAUDE.md` only, without an ADR.** Rejected — the procedure is itself a non-trivial decision and deserves a traceable record so a future contributor can see when and why it was chosen, and supersede it cleanly if needed.
- **Enforce the rules via custom git hooks rather than convention plus branch protection.** Considered for later. Branch protection on `main` already enforces the load-bearing constraints (no direct push, CI must pass, linear history). Local hooks for commit-message linting are a follow-up (tracked as a future enhancement, not in this ADR).
- **Per-package release cadence via Changesets from day one.** Deferred — the monorepo is single-versioned at `v0.0.x` for now. Changesets land when the first package is published to npm.
