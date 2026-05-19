# Mneme — Product Brief

**One-line**: Mneme is the open, user-sovereign memory layer for AI — your context, owned by you, portable across every model and tool.

**Tagline candidates**: *"Your memory. Your keys. Every model."* / *"Memory that belongs to you."* / *"The memory layer the AI era forgot to build."*

---

## The problem

In 2026, every serious knowledge worker uses 3–7 different AI tools daily — Claude, ChatGPT, Cursor, Perplexity, Gemini, Cline, custom agents. Each one starts from zero every time. Each one builds a half-broken proprietary "memory" feature that is:

- Stored on **their** servers, in **their** schema, locked to **their** product
- Plaintext (Microsoft Recall, OpenAI Memory) or opaque (Claude Projects)
- Not portable, not auditable, not exportable in any useful form
- Designed to *deepen* lock-in, not solve the user's actual problem

For developers building AI apps, the situation is worse: every team rebuilds memory from scratch, badly. The "memory" startups that exist (Mem0, Letta, Zep, Honcho) all picked the same server-side hosted model — they're competing with each other on the same axis, leaving the structurally harder and more defensible position empty.

For users, the trust deficit is real and growing. Microsoft Recall (May 2024) was crucified by the public for proposing "we'll record everything you do." The market is now actively waiting for a trustworthy answer. Nobody has shipped one.

## The wedge

Mneme is the **structural inverse** of every existing memory product:

| | Existing memory players | **Mneme** |
|---|---|---|
| Storage | Their servers | User's device (synced anywhere) |
| Encryption | Plaintext or server-side | End-to-end, client-held keys |
| Schema | Proprietary, closed | Open protocol, versioned spec |
| Provider coupling | Tied to one model/cloud | Works across all models |
| Business model | Lock-in on data | Lock-in on quality + network |
| Surfaces | Developer-only | Developer + consumer + enterprise |

We don't compete on "more memory" or "better memory" — we compete on **whose memory it is**. That is a category we can own.

## Why nobody is doing this (the real moat)

This gap exists not because the idea is novel, but because it's hostile to four different forces at once:

1. **Hostile to standard SaaS economics.** If users own their data and can take it anywhere, you can't lock them in. Investors steer founders away from this model. The closest analogues — 1Password, Proton, Signal — all took longer to scale than their lock-in competitors. We are making the deliberately harder business choice.
2. **Hostile to frontier-lab incentives.** OpenAI, Anthropic, Google, Meta all have strategic interest in keeping personal context inside their walls. Cross-provider portability is the literal opposite of what they want to build. They will never ship this. They will, however, *buy* it — which is our acquisition thesis.
3. **Technically harder.** Local-first sync with CRDTs, end-to-end encryption with searchable semantics, multi-device daemons, browser extensions, MCP servers, an open protocol with versioning — most YC AI startups don't have the patience.
4. **Requires a consumer surface.** Infra founders avoid consumer because it's brutal. But the trust story only lands if there's a consumer app where users *see* their memory and *feel* ownership. We turn the disadvantage into a moat by going where competitors won't.

When something is technically hard, business-model unfriendly, structurally impossible for incumbents, and requires a discipline most founders avoid — that is exactly the kind of position that, once occupied, is defended for years.

## The beachhead

We don't launch into "everyone with an LLM." We pick the smallest, sharpest wedge that has high willingness to pay and high signal:

**Primary ICP (developer side)**: Indie developers and small teams (1–20 people) building AI-native apps where memory matters and users are sophisticated — coding agents, research assistants, personal AI tools, vertical AI copilots. They have already tried Mem0 or rolled their own and have felt the pain. They are forum-active, OSS-friendly, and will adopt if the SDK is clean and the protocol is credible.

**Primary ICP (consumer side)**: AI power users — people running 3+ AI tools a day, technical or technical-adjacent, privacy-aware, the kind of people who already use 1Password and Proton. Estimated 3–5M globally. They will pay for a consumer Mneme app and become evangelists.

**Beachhead launch sequence**:
1. Ship the Mneme Protocol spec + open-source SDK + free MCP server (Claude Code instant install)
2. Land 20 indie developer design partners building real products on Mneme
3. Ship the consumer app + browser extension that captures memory from ChatGPT/Claude.ai/Gemini
4. Hosted API monetization for SDK users at scale
5. Enterprise tier for SOC2-required customers (year 2)

## The ecosystem (multi-product, one primitive)

The same memory primitive fans out into eight distinct SKUs, each with its own buyer and pricing model:

1. **The Mneme Protocol** — open spec, free forever, the foundation
2. **Mneme SDK** — open source (TS, Python), free, the developer wedge
3. **Mneme Cloud** — hosted backend, usage-based pricing, developer monetization
4. **Mneme App** — consumer desktop/mobile, freemium then $8–12/mo
5. **Mneme Browser Extension** — free, the consumer acquisition channel
6. **Mneme MCP Server** — free, the distribution wedge into Claude Code
7. **Mneme Enterprise** — RBAC, audit, on-prem, $30–100k/year ACV
8. **Mneme Memory Packs** — marketplace of role/profile templates, rev-share with creators

This is the Anthropic shape applied to memory: one core capability, many surfaces, every surface reinforces the moat of the core. Each SKU is a credible standalone business; together they're the category.

## Go-to-market wedge

Three distribution levers, in priority order:

1. **MCP distribution.** Mneme MCP server lives in the Claude Code marketplace from day one. Free. Best-in-class. Every Claude Code user who installs it becomes a Mneme user. Same for Cursor (when Cursor adopts MCP-style extensions). This is the cheapest distribution available in the AI dev ecosystem in 2026.
2. **Open-source credibility.** SDK and protocol on GitHub from launch. Aim for 5k stars in 6 months. Engineers trust what they can read.
3. **Consumer narrative.** Mneme is the answer to the Microsoft Recall backlash. We tell that story relentlessly. Privacy-press loves it. Hacker News loves it. Word-of-mouth among power users compounds.

We do **not** do paid acquisition until we have product/market fit and a clear LTV. We do **not** do enterprise sales motion until we have inbound demand. We do **not** chase logos for vanity.

## Acquirer set

A real acquisition story exists for Mneme because the strategic value of *neutral, cross-provider, trusted personal memory* increases as the AI ecosystem matures:

- **Apple** — Apple Intelligence and Siri are starved for cross-app context. Mneme is exactly what they'd want to acquire to get parity with Google.
- **Anthropic / OpenAI / Google** — whichever lab ends up losing the context war will pay handsomely for the neutral memory layer that gives them a route back.
- **1Password / Proton / Bitwarden** — natural acquirers extending vault-model trust into the AI era.
- **Microsoft** — needs a trustworthy answer to the Recall PR disaster.
- **Salesforce / Notion / Atlassian** — knowledge-work platforms that need persistent personal context.
- **PE rollups in personal AI** — almost certain to emerge in the next 24 months as consolidators.

## Honest risks (and how we manage them)

| Risk | Mitigation |
|---|---|
| Mem0 has raised real money and developer mindshare | Our differentiation is structural, not feature-level — they cannot pivot to local-first without breaking their business model |
| Apple ships personal memory in iOS first | Even if they do, it'll be Apple-only — we win the cross-platform layer |
| Local-first encrypted retrieval is technically hard | We start with a hybrid model (encrypted blobs + server vectors with controlled leakage) and evolve to full E2E |
| Consumer adoption is slow | The developer + MCP wedge funds us while consumer compounds |
| Standards work is glacial | We publish unilaterally; ratification can follow adoption |
| Frontier labs ship their own memory and bundle it | They can't go neutral without cannibalizing themselves. We are betting on that contradiction. |

## What "winning" looks like in 18 months

- Mneme Protocol is the de facto open standard for AI personal memory, with at least three non-trivial third-party implementations
- 10k+ developers using the SDK in production
- 50k+ consumers using the app or browser extension
- ARR in the $1–3M range from Mneme Cloud + consumer subs
- At least one frontier lab or major platform reaching out about partnership or acquisition
- A team of 3–5 people maximum (the leverage of an AI-native dev process showing visibly in our output)

## What "winning" looks like in 5 years

- Mneme is to AI memory what Stripe is to payments: invisible, trusted, everywhere
- Acquisition at $500M–$2B by one of the strategic buyers above, or independent at $50M+ ARR

---

*This brief is the founding document. Every product, prompt, and code decision should be traceable back to the thesis it advances.*
