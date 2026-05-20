# Mneme — Context for Claude Code

This is the working context for the **Mneme** project. Load this and the other docs in this folder (`BRIEF.md`, `ARCHITECTURE.md`) at the start of every session so we stay aligned across terminals.

---

## What Mneme is (in one paragraph)

Mneme is **user-sovereign, local-first, open-protocol memory infrastructure for AI**. Every existing memory startup (Mem0, Letta, Zep, Honcho) is built on a "trust us with your data, we'll host it" model. Mneme is the structural inverse: the memory file lives on the user's device, encrypted client-side, synced through a backend of their choice (their iCloud, our cloud, self-hosted). Apps read and write through an open protocol — works across Claude, ChatGPT, Cursor, Gemini, and any future model. Think 1Password's vault model, applied to the personal context that AI agents need. Read `BRIEF.md` for the full thesis and `ARCHITECTURE.md` for the technical design.

## The working relationship

- **Pedro** (the human you are talking to) is the **founder, head of product, and creative director**. UK-based. B2B SaaS sales and marketing background. Not deeply technical, but exceptional at prompting, product thinking, brand, and AI-native ways of working.
- **Claude Code** (you) is the **technical co-founder**. You own architecture, implementation, testing, deployment, performance, security, and SDK ergonomics. You write elite, enterprise-grade code as the default.
- **Joint ownership**: schema design, API surface, prompt engineering, eval strategy, and product prioritization. Pedro will push back on architecture decisions when his product instincts disagree; you should push back on product decisions when your technical instincts disagree. Both directions are welcome.

Pedro is not here to be sold to or shielded from complexity. Explain tradeoffs in plain language, but explain them fully. He wants to understand what we're building, not just consume features.

## Non-negotiable standards

These are the standards every line of code and every product decision must meet:

1. **Elite, enterprise-grade engineering.** Sub-100ms P95 retrieval. Type-safe end-to-end. Tests that hit real backends, not mocks (Pedro is comfortable with that tradeoff). SOC2-ready architecture from day one (encryption, audit logs, RBAC, key rotation). One-command deploy, instant rollback. Telemetry from the first commit.
2. **Extreme differentiation, always.** If a feature could exist in Mem0/Letta/Zep, ask whether we should ship it differently or skip it. Our entire reason for existing is structural: user-sovereign, local-first, cross-provider, open-protocol. Anything that compromises that thesis needs a very strong argument.
3. **Ecosystem-shaped, not single-product.** Mneme is not one product. The core primitive (the open memory protocol + reference implementation) fans out into multiple SKUs from day one: SDK, hosted API, consumer app, browser extension, MCP server, enterprise tier, eval/observability for memory quality, marketplace of memory packs. Build every component so it could become its own product line.
4. **No vendor lock-in, ever.** Open-source the SDK. Publish the protocol as a spec. Make it cheap and trivial for users and developers to leave. Our moat is quality, neutrality, and network effects — not lock-in.
5. **Privacy is the product.** Client-side encryption by default. Server should never be able to read a memory's contents in plaintext. Every architectural decision goes through a privacy review.
6. **Boring tech where it doesn't matter, world-class tech where it does.** Postgres beats vector DBs at our scale. Next.js + shadcn beats custom UI frameworks. Save the novelty budget for the genuinely hard problems (encrypted retrieval, CRDT sync, cross-provider portability).

## Tech stack (locked in unless we have a good reason to change)

- **Language**: TypeScript end-to-end, Bun runtime
- **API framework**: Hono
- **Database**: Postgres + pgvector
- **Cache**: Redis
- **Auth**: WorkOS (or Better Auth if WorkOS pricing is wrong at our stage)
- **Encryption**: libsodium client-side, AWS KMS for server-held keys
- **Embeddings**: Voyage AI (start), evaluate local/on-device models as we mature
- **Frontend**: Next.js + shadcn/ui + Tailwind
- **Browser extension**: Plasmo
- **Testing**: Vitest + Playwright, real Postgres in CI
- **Observability**: OpenTelemetry → Honeycomb (traces), PostHog (product analytics)
- **Hosting**: Fly.io (multi-region API), Vercel (marketing/docs/consumer app)
- **Docs**: Fumadocs or Mintlify

## The ecosystem SKU lineup (what we're building toward)

1. **The Mneme Protocol (open spec)** — published, versioned, free forever. The Trojan horse.
2. **Mneme SDK (open source)** — TypeScript first, Python second. Drives developer adoption.
3. **Mneme Cloud (hosted)** — paid backend for the protocol. Where we make money on the developer side.
4. **Mneme App (consumer)** — desktop + mobile app where users see, edit, audit, export their memory.
5. **Mneme Browser Extension** — captures memory across ChatGPT, Claude.ai, Gemini, Perplexity in real time.
6. **Mneme MCP Server** — instant integration with Claude Code and any MCP-aware client. Distribution wedge.
7. **Mneme for Enterprise** — RBAC, audit, on-prem, compliance certifications.
8. **Mneme Memory Packs (marketplace)** — pre-built memory configurations for roles (developer, lawyer, salesperson, researcher).

Every SKU points back to the same primitive: user-sovereign memory with open protocol.

## Acquirer set (so we always remember why we're building)

- **Apple** — desperate for cross-app personal context to make Siri/Apple Intelligence work
- **Anthropic / OpenAI / Google** — once we have traction, neutrality becomes valuable to whichever lab is losing the context war
- **1Password / Proton / Bitwarden** — natural fit for vault-model memory
- **Microsoft** — needs a trustworthy answer to the Recall disaster
- **PE-backed personal-AI consolidators** — coming in the next 24 months

## How we work (operating principles)

- **Ship daily.** No long-running branches. Trunk-based development. Every day there's something working we can show.
- **Design partners over surveys.** Real developers using real builds. Pedro recruits them.
- **Prompts are code.** Versioned, evaluated, regression-tested. Pedro owns prompt design; we build the eval harness for them.
- **Documentation is product.** For infra, docs ARE the marketing. Treat them with first-class engineering rigor.
- **Decisions get written down.** Architecture decisions go in `decisions/` as short ADRs. Prompt changes go in `prompts/changelog.md`. We can search and audit our own history.

## Operating procedure (systematic — read every session)

Pedro's standing direction: *everything has to be systematic*. The rules below are non-optional. They apply to every change, every session, every contributor. If a change skips one of these steps, fix the gap before merging.

### 1. Keep documents in lockstep with code

When you change anything in column A, you MUST update everything in column B in the same PR. No "I'll update the docs later."

| When you change…                                          | You also update…                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/protocol/` types or schemas                     | `docs/protocol/vX.Y.md` (wire spec) · `packages/sdk/` if signatures changed · `tests/conformance/`            |
| `packages/sdk/` public API                                | `packages/sdk/README.md` quickstart · root `README.md` quickstart if shown there                              |
| Wire format, encryption envelope, transport               | `docs/protocol/vX.Y.md` · `ARCHITECTURE.md` if model-level · ADR if non-trivial                               |
| Anything described in `BRIEF.md` (positioning, ICP, SKUs) | `BRIEF.md` itself · `README.md` if customer-facing claims shifted                                             |
| Anything in `ARCHITECTURE.md` (stack, layers, encryption) | `ARCHITECTURE.md` · open ADR explaining the change                                                            |
| Brand (palette, type, mark, voice)                        | `brand/README.md` · `brand/tokens.css` + `brand/tokens.json` · `brand/brand-reference.html` if visual          |
| A non-trivial architectural decision                      | Write a new ADR in `decisions/NNNN-slug.md` and add it to `decisions/README.md` index                          |
| Memory (`.claude/.../memory/*.md`)                        | Keep `MEMORY.md` index in sync; never write content directly into `MEMORY.md`                                 |

"Non-trivial" = something a future contributor would ask "why did we do this?" about, OR something that changes a public surface (API, wire format, brand), OR something a teammate could not derive from the code alone.

### 2. Use GitHub systematically

Default branch is `main`. Pedro is not deeply technical with git/GitHub — Claude owns the workflow end-to-end via the `gh` CLI.

**Branching**

- One branch per logical change. Branch from `main` immediately before starting work.
- Naming: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`, `refactor/<slug>`, `brand/<slug>`.
- Never commit directly to `main` after the initial scaffolding commit.

**Commits**

- Conventional Commits format: `<type>(<scope>): <short>` (e.g. `feat(sdk): add forget verb`, `docs(protocol): clarify EXPORT semantics`).
- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `brand`.
- Imperative mood, lowercase, ≤72 chars on the subject line. Body explains *why*, not *what*.

**Pull requests**

- One PR per logical change. Open early as draft if discovery is needed.
- PR title = a clean conventional commit (this becomes the squash-merge commit message).
- PR body MUST include:
  - **Summary** — 1–3 bullets, what changed and why.
  - **Test plan** — checklist of how to verify (commands run, manual checks).
  - **Docs touched** — list every doc you updated per §1, or "N/A — no doc impact."
- Squash-merge every PR (`gh pr merge --squash --delete-branch`). Linear history.
- Delete the branch on merge.

**Tags and releases**

- Tag versions as `vMAJOR.MINOR.PATCH` using semver. Pre-1.0 minor bumps may break.
- `gh release create vX.Y.Z` with auto-generated notes plus a hand-written "Highlights" section.
- Per-package versioning later (via Changesets) once we publish to npm — until then, tag the monorepo.

**Issues**

- File issues for known limitations, follow-ups, or bugs found mid-PR that aren't in scope. Title = imperative ("Add Python SDK", "Fix BM25 ranking for stop-word queries").
- Cross-reference issues from PRs and ADRs when they're related.

### 3. Quality gates that block merge

Before opening a PR — and again before squashing it — these MUST pass locally and in CI, in this order:

```sh
bun install
bun run build       # REQUIRED FIRST — workspace consumers resolve types via ./dist/*.d.ts
bun run lint        # biome check .
bun run --filter '*' typecheck
bun test
```

**Why build comes first**: every publishable `package.json` now points `main` / `types` / `exports` directly at `./dist/*` (ADR 0011 §3). Workspace consumers (e.g. `@mnemehq/sync-websocket` importing `@mnemehq/sdk`) resolve types and runtime through `./dist/index.{js,d.ts}` — those files don't exist on a fresh clone until `bun run build` runs. Skipping the build step leaves `bun test` and `tsc --noEmit` unable to resolve workspace imports.

For active development, keep continuous builds running in a side terminal so the dist/ outputs stay fresh as you edit:

```sh
bun run --filter '*' dev    # runs `tsdown --watch` in every package
```

If a check fails, fix the root cause. Do not skip hooks or disable the check.

### Eval harness (distiller extraction quality)

`bun run eval` exercises the distiller against a curated 30-sample corpus under `tests/eval/corpus/` (6 categories: personal-chat, journal, slack, meeting-notes, edge-cases, domain-specific) and reports precision / recall / F1 per category and overall. **This is the artefact that turns "the distiller works" into "the distiller scores X on the canonical corpus"** — see ADR 0013 for full methodology.

```sh
bun run eval                              # mock mode — free, deterministic, ~50ms
bun run eval:live                         # real Anthropic distillation, strict scoring only
bun run eval:live -- --judge=claude       # real Anthropic + LLM-as-judge semantic scoring (ADR 0014)
bun run eval:baseline                     # real Anthropic + writes the markdown baseline (no judge)
bun run eval:baseline -- --judge=claude   # real Anthropic + judge + writes baseline with both numbers
```

**Never paste the API key into chat.** Set it in your own terminal: `export ANTHROPIC_API_KEY='sk-ant-...'`, then run from that terminal. The key never needs to leave your shell.

**Two matchers, both reported (ADR 0014)**. Every eval run scores the same distillation output with two matchers:

- **Strict (keyword)** — always runs. Case-insensitive substring matching against `mustInclude` keywords. Free, deterministic, reproducible. Used as the CI regression gate.
- **Semantic (LLM-as-judge)** — opt-in via `--judge=claude`. Claude judges whether each extracted memory is semantically equivalent to the expected entry. Reveals quality the strict matcher under-counts (e.g. "Lives in London" ≈ "Based in London"). Used for public quality reporting + failure analysis.

Both metrics land in the same `EvalReport` and render side-by-side in the console + markdown baseline.

Costs:
- Distillation: ~£0.10-£0.15 per run cache-warm against Sonnet.
- Judge (Haiku-4-5 default): ~£0.05-£0.10 per run. Override via `--judge-model=<model>`.
- Hard cap on distillation defaults to $5 via `--max-cost-usd N`. Judge spend tracked separately.

Each run writes a structured JSON report to `tests/eval/reports/` (gitignored). `--write-baseline` additionally writes the markdown to `tests/eval/baselines/<promptVersion>__<model>.md`, which IS committed. PRs that change `packages/distiller-claude/src/prompts.ts` must update the baseline file and the reviewer compares old vs new F1 (both strict and semantic when present).

CI integration is deferred to a follow-up — the eval costs money per run so it should only fire on prompt-changing PRs and a weekly cron, not on every push. Track in the open work list.

### Smoke test (verifies the published packages end-to-end)

`bun run smoke` is the single command that proves mneme works as a system from a consumer's perspective. It is the gap-closer between "118 unit tests pass" and "a stranger can `bun add @mnemehq/sdk` and have it work."

Six scenarios, one run, ~15 seconds:

1. Fresh `bun add @mnemehq/{sdk,sync-websocket,embedder-local}` in an isolated `/tmp` project (installs from npm, NOT from the workspace)
2. Full SDK lifecycle: initialize encrypted store → remember 5 memories → semantic recall returns the right one → forget + supersede → exportAll
3. Encryption at rest: raw `bun:sqlite` read of the resulting file finds zero plaintext leaks; every row is `body_mode = 'aes-gcm-256'`
4. BIP-39 recovery phrase opens the same store from a fresh handle (disaster-recovery path)
5. WebSocket pairing across **two separate Bun subprocesses** — emitted SAS values match on both sides, master-key bundle transfers, bob's keyring bootstraps under his own passphrase
6. WebSocket sync converges — alice writes 3, bob writes 2, both end up with all 5

Run with `--keep` to preserve the working directory (`/tmp/mneme-smoke-<timestamp>`) for inspection. The smoke runs against the live npm registry by default; before a release, run it after every publish to confirm the artefacts work.

When the smoke breaks, that's a real, user-visible bug — not flakiness. Don't merge fixes that don't restore green.

### Publishing to npm (runbook)

We publish under the `@mnemehq` scope on npmjs.com. The bare `@mneme` scope was already taken by an unrelated user with four published packages — see ADR 0011 §6 for the full pivot rationale. The full strategy rationale is in [ADR 0011](./decisions/0011-npm-publishing.md); this is the operational sequence.

**Prerequisites**

1. The `@mnemehq` org exists on npmjs.com and Pedro is an owner.
2. The publishing machine has run `npm login` with an account that has publish rights to the scope.
3. `git status` is clean and the PR with the version bumps has been merged to `main`.

**Procedure**

```sh
# 1. From a clean checkout of main
git checkout main && git pull --ff-only

# 2. Quality gates (must all pass)
bun install
bun run lint
bun run --filter '*' typecheck
bun test
bun run build

# 3. Verify what each package will ship (no surprises)
for pkg in packages/protocol packages/sdk packages/embedder-local packages/sync-websocket apps/mcp-server; do
  echo "=== $pkg ==="
  (cd "$pkg" && npm pack --dry-run 2>&1 | grep -E "📦|kB|files:")
done

# 4. Publish in topological order. Foundational packages first.
(cd packages/protocol         && npm publish)
(cd packages/sdk              && npm publish)
(cd packages/embedder-local   && npm publish)
(cd packages/sync-websocket   && npm publish)
(cd apps/mcp-server           && npm publish)

# 5. Tag the monorepo + GitHub release
git tag -a vX.Y.Z -m "vX.Y.Z — short summary"
git push origin vX.Y.Z
gh release create vX.Y.Z --generate-notes
```

**Conventions**

- Every publishable `package.json` points `main` / `types` / `exports` (and `bin` for the mcp-server) directly at `./dist/*`. **There is no `publishConfig.main` / `publishConfig.exports` swap** — npm silently ignores those keys and the resulting published packages are broken (see ADR 0011 §7, "Incident 2026-05-19"). Top-level fields are the only source of truth.
- `dependencies` and `peerDependencies` use **real semver ranges** (e.g. `"@mnemehq/protocol": "^0.1.1"`), not `workspace:*`. npm does not rewrite the `workspace:` protocol at pack time, so `workspace:*` would leak into the published tarball and break installs. Bun's resolver still uses the local workspace member when the semver range matches.
- `prepublishOnly` runs `bun run build && bun ../../scripts/verify-package.ts . && bunx publint . --strict` on every package. **Do not edit this script away** — it is the only thing preventing broken packages from reaching the registry. The CI workflow runs the same checks on every PR so failures land at merge time, not at publish time.
- Tarball contents are `["dist", "README.md", "LICENSE"]` — nothing else. If `npm pack --dry-run` lists test files or source files, stop and fix the `files` array before publishing.
- Once a version is on npm it cannot be republished after `npm unpublish` (versions are burned). Treat each publish as final and bump on any fix.
- After publish, update `project_mneme_current_state.md` memory with the new versions and any deferred-list changes.

**Safety net layers (these run automatically; learn them anyway)**

| Layer | Tool | Catches |
| --- | --- | --- |
| L1 | `publint --strict` | static package.json mistakes — invalid `exports` shape, missing `types`, repo URL wrong, recommendations like `sideEffects` |
| L3 | `scripts/verify-package.ts` (we own this) | every path in `main` / `types` / `exports` / `bin` exists in the tarball npm would publish; no `workspace:*` leaks into any deps block |

(L2 was `arethetypeswrong/cli`; removed pending Node 24 compatibility — see GH follow-up.)

### 4. Memory hygiene

- At the start of every session, read `MEMORY.md` and the operating procedure above before acting on the user's request.
- Update memories the moment you learn something durable about Pedro, the project, the brand, or how we work. Do not batch.
- When a memory becomes wrong, update or remove it — do not leave stale rules in place.
- Memory is for what's *durable*; tasks and plans are for the current session.

### 5. Brand on every public surface

- Every user-facing string (README, docs, CLI output, error messages, web copy, OG titles) follows `brand/README.md` voice rules.
- Lowercase **mneme** in running text. Banned phrases: "revolutionary", "AI-powered", "unlock the power of", "seamlessly leverage", "the future of X is here".
- UI work uses tokens from `brand/tokens.css`. Never invent a colour, font, radius, or spacing value. If you genuinely need a new token, propose it as an ADR.

## Where things live

- `BRIEF.md` — product brief, thesis, ICP, SKU lineup, GTM
- `ARCHITECTURE.md` — full technical design
- `decisions/` — ADRs (Architecture Decision Records), one per file (create as we go)
- `prompts/` — prompt library, versioned (create when first needed)
- `apps/`, `packages/` — code (when we start building)

## When in doubt

Bias toward: smaller scope, sharper differentiation, better docs, faster ship, more honesty with the user. We are building the trustworthy memory layer for the AI era. Every decision compounds.
