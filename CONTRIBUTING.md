# Contributing to mneme

Thank you for considering a contribution. mneme is open-source memory infrastructure for AI, and the project's value compounds with every careful contribution. We treat docs, tests, and code with equal seriousness.

This file is the entry point. It does **not** replace [`CLAUDE.md`](./CLAUDE.md) (the canonical operating procedure) or the [`decisions/`](./decisions/) ADR series — those are the authoritative source for non-trivial decisions. It does extract the parts external contributors need to know.

---

## Quick orientation

| Doc | Purpose |
| --- | --- |
| [`README.md`](./README.md) | Public landing, install, quickstart, benchmark |
| [`BRIEF.md`](./BRIEF.md) | Product thesis, ICP, GTM (internal-facing) |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Authoritative technical design, threat model |
| [`CLAUDE.md`](./CLAUDE.md) | Operating procedure for the working session (humans + AI) |
| [`SECURITY.md`](./SECURITY.md) | Vulnerability disclosure policy + scope |
| [`docs/protocol/`](./docs/protocol/) | Versioned mneme Protocol spec |
| [`decisions/`](./decisions/) | Architecture Decision Records (ADRs) — `decisions/README.md` is the index |

---

## Before you start

mneme is a [Bun](https://bun.sh) workspace monorepo. You need:

- **Bun ≥ 1.3** at runtime
- **Git**
- A POSIX shell (macOS / Linux / WSL2)

```sh
git clone https://github.com/ppserapiao/mneme.git
cd mneme
bun install
bun run build       # REQUIRED before typecheck / test — workspace consumers resolve types via ./dist/*.d.ts
bun run lint        # biome check .
bun run --filter '*' typecheck
bun test
```

If all five succeed (`install`, `build`, `lint`, `typecheck`, `test`), you have a working dev environment.

---

## Where contributions are most welcome

- **Bug reports** — file an issue using the bug-report template. Include reproduction steps, the affected package version, and your environment (`bun --version`, OS).
- **Documentation** — typo fixes, broken-link fixes, clarifications. The smaller the better — these merge fast.
- **Protocol conformance tests** — additions to [`tests/conformance/`](./tests/conformance/) that exercise corner cases of the wire format.
- **Eval corpus contributions** — new samples for [`tests/eval/corpus/`](./tests/eval/corpus/) that surface realistic extraction failures.
- **Distillers for other models** — implement the `Distiller` interface (`packages/sdk/src/distiller.ts`) for your favourite LLM and demonstrate it scores reasonably on the eval harness.
- **Language SDKs** — Python is highest priority once the protocol surface stabilises. Discuss in an issue first.

Areas where you should **discuss in an issue first**:

- Changes to the protocol surface (`packages/protocol/`) — any wire-format change is a protocol-version bump
- Changes to the encryption envelope — these require an ADR
- New top-level packages or apps — talk through fit with the architecture

---

## How to submit a change

### 1. Branch from `main`

```sh
git checkout main
git pull --ff-only
git checkout -b feat/<short-slug>    # or fix/, docs/, chore/, refactor/, test/
```

Branch-name prefixes (`feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `build/`, `ci/`, `perf/`, `style/`) match the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) type you'll use in the commit + PR title.

### 2. Write code + tests + docs in lockstep

mneme has a **strict lockstep rule** (CLAUDE.md §1): when you change column A, update column B in the same PR. No "I'll update the docs later."

| When you change… | You also update… |
| --- | --- |
| `packages/protocol/` types or schemas | `docs/protocol/vX.Y.md` · `packages/sdk/` if signatures changed · `tests/conformance/` |
| `packages/sdk/` public API | `packages/sdk/README.md` quickstart · root `README.md` quickstart if shown there |
| Wire format / encryption envelope / transport | `docs/protocol/vX.Y.md` · `ARCHITECTURE.md` if model-level · ADR if non-trivial |
| Anything in `BRIEF.md` (positioning, ICP, SKUs) | `BRIEF.md` itself · `README.md` if customer-facing claims shifted |
| Anything in `ARCHITECTURE.md` | `ARCHITECTURE.md` · open ADR explaining the change |
| Brand (palette, type, mark, voice) | `brand/README.md` · `brand/tokens.{css,json}` · `brand/brand-reference.html` if visual |
| A non-trivial architectural decision | Write a new ADR in `decisions/NNNN-slug.md` and add it to `decisions/README.md` |

"Non-trivial" = something a future contributor would ask "why did we do this?" about, OR something that changes a public surface (API, wire format, brand), OR something a teammate could not derive from the code alone.

### 3. Quality gates that block merge

These must pass locally **and** in CI:

```sh
bun install
bun run build
bun run lint
bun run --filter '*' typecheck
bun test
```

If a check fails, fix the root cause. Do not skip hooks (`--no-verify`) or disable the rule. We use [Biome](https://biomejs.dev/) for lint + format — it's strict on purpose.

### 4. Commit messages — Conventional Commits

```
<type>(<scope>): <short subject>

<optional body explaining the WHY, not the WHAT>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.

Subject line: imperative mood, lowercase, ≤ 72 chars.

Example:

```
fix(sdk): correct ULID monotonicity under sub-millisecond batch writes

Two consecutive writes within the same millisecond were reusing the
random suffix, causing collisions. Use the monotonic ULID factory from
the spec instead.
```

### 5. Pull request

- One PR per logical change. Open early as draft if you're seeking feedback.
- **PR title** = a clean Conventional Commit (this becomes the squash-merge commit message).
- **PR body** must include:
  - **Summary** — 1–3 bullets, what changed and why
  - **Test plan** — checklist of how to verify (commands run, manual checks)
  - **Docs touched** — list every doc you updated per the lockstep table, or `N/A — no doc impact`
- We squash-merge every PR. Linear history.
- Delete the branch on merge.

If you've never opened a PR on GitHub, [GitHub's quickstart](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request) covers the mechanics.

---

## Code style

- **TypeScript**, strict mode. `verbatimModuleSyntax: true` is on — use `import type` for type-only imports.
- **No `any`** — Biome enforces this. Use `unknown` and narrow.
- **No `console.log`** in shipped code — Biome warns. `console.error` for genuine error paths is fine.
- **Tests hit real backends**, not mocks. The smoke test runs against published-npm packages in an isolated `/tmp` directory.
- **Comments**: default to writing none. Only add a comment when the *why* is non-obvious (a hidden constraint, a subtle invariant, a workaround for a specific bug). Don't explain what well-named code already says.

---

## Privacy and security in contributions

- **Never commit secrets** — API keys, recovery phrases, anything beginning with `sk-`, `pat_`, `ghp_`, `eyJ`. The pre-commit hook scans for common patterns, but the responsibility is yours.
- **If you accidentally commit a secret**, treat it as compromised even if you force-push to remove it. Revoke immediately at the provider.
- For anything cryptographic, follow [`SECURITY.md`](./SECURITY.md). Cryptographic mistakes can be subtle — ask in the issue first.

---

## Where to ask questions

- **General questions** → [GitHub Discussions](https://github.com/ppserapiao/mneme/discussions) (preferred) or open an issue with the `question` template.
- **Bug reports** → open an issue with the `bug` template.
- **Security issues** → [`SECURITY.md`](./SECURITY.md), private vulnerability reporting.

---

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be respectful, be specific, assume good faith. Report violations via the channels in `CODE_OF_CONDUCT.md`.

---

## Licensing

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](./LICENSE) — the same as the rest of mneme. No CLA required for occasional contributors.

For sustained or significant contributions, we may ask you to sign a lightweight CLA so the project can continue to relicense if needed (e.g. dual-licensing for the future enterprise tier). We'll never ask for one retroactively for past contributions.

---

*Thank you for caring about this. Memory belongs to users; the only way that becomes true at scale is with engineers like you.*
