<!--
Thanks for opening a PR. mneme follows a strict lockstep operating procedure
(see CLAUDE.md §1) — when you change column A, update column B in the same PR.

PR title format: Conventional Commit, lowercase, ≤72 chars.
  feat(sdk): add forget verb
  fix(transport): handle reconnect storm
  docs(protocol): clarify EXPORT semantics

This becomes the squash-merge commit message — make it land cleanly.
-->

## Summary

<!-- 1–3 bullets. What changed and WHY. Not what — the diff says that. -->

-
-

## Test plan

<!-- How a reviewer verifies this works. Checked = ran locally, passed. -->

- [ ] `bun install`
- [ ] `bun run build`
- [ ] `bun run lint`
- [ ] `bun run --filter '*' typecheck`
- [ ] `bun test`
- [ ] Manual verification:

## Docs touched (lockstep)

<!--
List EVERY doc you updated, or write "N/A — no doc impact" if nothing applied.
Cross-reference the lockstep table in CONTRIBUTING.md / CLAUDE.md §1.
-->

- [ ] N/A — no doc impact
- [ ] `README.md` (public quickstart / benchmark / claims)
- [ ] `BRIEF.md` (positioning / ICP / SKU)
- [ ] `ARCHITECTURE.md` (model-level technical change)
- [ ] `docs/protocol/vX.Y.md` (wire format / verb)
- [ ] `packages/<pkg>/README.md` (public package quickstart)
- [ ] `tests/eval/baselines/*.md` (prompt change → re-run eval + commit baseline)
- [ ] New ADR in `decisions/NNNN-<slug>.md` + indexed in `decisions/README.md`
- [ ] `brand/README.md` or `brand/tokens.{css,json}` (visual / token change)
- [ ] Other:

## Risk / blast radius

<!-- Tick what applies. Reviewer uses this to calibrate scrutiny. -->

- [ ] Touches public package surface (`packages/*/src/index.ts`) — semver-relevant
- [ ] Touches protocol or wire format
- [ ] Touches encryption envelope or signing
- [ ] Touches the build / publish pipeline
- [ ] Internal-only — refactor, test, docs, infra

## Linked issues / ADRs

<!-- Closes #N, references ADR-XXXX, etc. -->

-

## Checklist

- [ ] Conventional Commit title; one logical change in this PR
- [ ] No secrets committed (`sk-`, `pat_`, `ghp_`, `eyJ`, recovery phrases, `.env*` files)
- [ ] No `console.log` left in shipped code
- [ ] Lockstep docs updated (see above)
- [ ] CI is green or I've explained why a transient failure is unrelated
