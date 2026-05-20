/**
 * Distillation prompts for ClaudeDistiller (ADR 0012 §7).
 *
 * The system prompt and the tool schema together ARE the product. They get
 * versioned, evaluated, and updated independently of the adapter code. Prompt
 * + schema changes that affect output shape get a bump in `PROMPT_VERSION`
 * so the eval harness (ADR 0013) can pin a specific revision.
 *
 * Anthropic's prompt-cache API tags large stable blocks as cacheable. The
 * system prompt + few-shot examples below are ~3-4k tokens, marked cacheable,
 * and produce a ~90% input-cost discount on cache hits within a 5-minute TTL.
 *
 * Revision history:
 *   2026-05-20a — initial. F1=56.7% on the 30-sample corpus (baseline).
 *                 Weakest: slack F1=42.9%, domain-specific F1=45.2%.
 *                 Strongest: edge-cases P=100% (zero hallucinations on negatives).
 *   2026-05-20b — slack + domain-specific revision.
 *                 (a) explicit multi-voice attribution rule + new slack example
 *                 (b) new technical-stack example covering tool names
 *                 (c) tightened "prefer skipping marginal extractions" guidance
 *                     to curb journal/meeting-notes over-extraction (v1 FP > FN)
 *                 (d) explicit instruction to read `speakerLabel` hint when present
 *                 F1=66.1% (+9.4pp over v1). Big wins: domain-specific (+27pp),
 *                 meeting-notes (+11pp). Regression: edge-cases (-30pp) — the
 *                 "skip marginal" rule was applied too broadly, dropping
 *                 legitimate explicit-but-simple extractions.
 *   2026-05-20c — Phase 1.5: recover the edge-cases regression + push slack.
 *                 (e) QUANTITY rule scoped to INFERRED extractions only —
 *                     explicit statements always extract regardless of simplicity
 *                 (f) new edge-case few-shot showing extraction from a repetition
 *                     input (recovers v2026-05-20b's lost recall on edge-005)
 *                 (g) new dense/abbreviated slack-style few-shot (different
 *                     texture from the structured pedro/sarah multi-voice one)
 */

export const PROMPT_VERSION = '2026-05-20c'

/**
 * The kinds we extract. Aligned to `MemoryKindSchema` from `@mnemehq/protocol`:
 *   fact, preference, event, relationship, context, skill.
 */
export const MEMORY_KINDS_FOR_PROMPT = [
  'fact',
  'preference',
  'event',
  'relationship',
  'context',
  'skill',
] as const

export const SYSTEM_PROMPT = `You extract durable, useful memories about a single speaker from raw text. The text may be a conversation transcript, a journal entry, a meeting note, a chat message, or a multi-voice thread (Slack-style "name: message" format).

Your job is to identify the *kind* of memory worth keeping, distill each one into a single self-contained sentence, and call the \`record_memories\` tool with a structured list.

CATEGORIES (use these exact values for "kind"):
  - fact          — durable, verifiable information about the speaker (location, role, identity, possessions, allergies, fixed details about their life)
  - preference    — things the speaker likes, dislikes, or prefers; opinions held over time
  - event         — specific things that happened to the speaker, with rough time context
  - relationship  — named people in the speaker's life and how they relate (colleague Sarah, partner Mark, dog Hazel)
  - context       — current ongoing situation, project, or theme the speaker is engaged with
  - skill         — abilities, expertise, tools the speaker uses, things they're learning. Be specific with named tools (e.g. "Uses Bun for the backend", not "Uses a modern runtime")

WHO IS THE SPEAKER
- The input may be a single-author note (journal, monologue, status update) — the speaker is the author.
- The input may be a multi-voice thread (Slack-style "name: message", chat-app exchange) — the speaker is identified by the header you may receive ("Speaker: <name>"). If no speaker header is present, the speaker is the FIRST person whose first-person voice ("I/me/my") appears.
- ONLY extract memories about the identified speaker. Statements other people make about themselves or about third parties are not the speaker's memories — even if interesting.

WHAT TO EXTRACT
- Anything the speaker states explicitly about themselves
- Things they imply strongly enough that a reasonable reader would record them as durable
- Updates to previously held positions ("used to drink Nespresso, now into single-origin")
- Specific tools / software / methodologies the speaker uses (always extract by name — "Uses Figma" not "uses a design tool")
- Current concerns and commitments (working on X, attending Y next week)
- Named relationships and their context (role, organisation, dynamic)

WHAT NOT TO EXTRACT
- Information about OTHER speakers in a multi-voice thread (extract relationships TO them, not facts ABOUT them)
- Third-party information that doesn't involve the speaker (gossip about colleagues; news headlines they mention)
- Hypotheticals, brainstorms, "what if" musings — even when phrased confidently
- Generic statements that aren't specific to this person ("Mondays are tough")
- Questions the speaker asked (those are not memories about them)
- Fleeting moods or one-off reactions ("ugh, Monday")

WRITING RULES
- Each memory is a single complete English sentence
- Use the third person ("Prefers single-origin coffee") not the first ("I prefer...")
- Each memory MAX 500 characters; aim for ~100-200
- No bullet points, no markdown inside the memory body
- Always set "sourceContext" to a verbatim ≤120-char excerpt from the input that justifies the extraction

CONFIDENCE RUBRIC (use these as anchors)
- 0.95+   stated explicitly in the input ("I'm allergic to peanuts")
- 0.75    strongly implied but not direct
- 0.55    inferred from indirect signals
- below 0.50  do not include; the SDK threshold defaults to 0.5

QUANTITY — PREFER SKIPPING MARGINAL EXTRACTIONS
- This rule applies to INFERRED extractions only. If the speaker EXPLICITLY states a fact about themselves — even a simple one, even one stated twice — always extract it. "I'm in London. I work in product." is two explicit facts and warrants two extractions, not zero.
- For inferred extractions at confidence ~0.55, lean toward SKIPPING rather than including. Weak inferences accumulate noise.
- One sharply-written memory that covers two related facts beats two thin memories splitting hairs ("Lives in London and works in product" is also acceptable when the speaker treats them as a single signal — but it's not REQUIRED to combine them).
- If the input contains nothing memorable about the speaker, return an empty list. Quality > quantity.

CALL THE TOOL. Do not respond with prose.`

/**
 * Few-shot examples. Sent as alternating user/assistant turns so the model
 * sees real input → expected tool call mappings. Marked cacheable by the
 * adapter on every request.
 *
 * Seven examples covering: single-author preference update, single-author
 * relationship statement, single-author skill/context, MULTI-VOICE SLACK-
 * STYLE THREAD (added in 2026-05-20b — targets slack), TECHNICAL STACK
 * extraction (added in 2026-05-20b — targets domain-specific), EXPLICIT
 * REPETITION (added in 2026-05-20c — recovers edge-cases regression), and
 * DENSE ABBREVIATED STANDUP (added in 2026-05-20c — pushes slack harder
 * with a different texture from the structured multi-voice example).
 */
export const FEW_SHOT_EXAMPLES = [
  {
    user: 'Had a great espresso at the new place on Brick Lane. Reminded me I really do prefer single-origin to blends.',
    extracted: [
      {
        kind: 'event',
        body: 'Visited the new espresso bar on Brick Lane',
        confidence: 0.9,
        sourceContext: 'Had a great espresso at the new place on Brick Lane',
      },
      {
        kind: 'preference',
        body: 'Prefers single-origin coffee over blends',
        confidence: 0.95,
        sourceContext: 'I really do prefer single-origin to blends',
      },
    ],
  },
  {
    user: 'Quick note before I forget — Sarah on the marketing side is replying super fast on Slack DMs, much faster than email. Probably the right channel for her going forward.',
    extracted: [
      {
        kind: 'relationship',
        body: 'Sarah works in marketing',
        confidence: 0.95,
        sourceContext: 'Sarah on the marketing side',
      },
      {
        kind: 'preference',
        body: 'Prefers Slack DMs over email for reaching Sarah in marketing',
        confidence: 0.9,
        sourceContext: 'Probably the right channel for her going forward',
      },
    ],
  },
  {
    user: "Just finished week 3 of Spanish on Duolingo. Hard but I'm sticking with it — want to be conversational by the trip to Barcelona in October.",
    extracted: [
      {
        kind: 'skill',
        body: 'Learning Spanish on Duolingo; currently in week 3',
        confidence: 0.95,
        sourceContext: 'finished week 3 of Spanish on Duolingo',
      },
      {
        kind: 'context',
        body: 'Working toward conversational Spanish before a trip to Barcelona in October',
        confidence: 0.9,
        sourceContext: 'want to be conversational by the trip to Barcelona in October',
      },
    ],
  },
  {
    user: "Speaker: pedro\n\npedro: Sarah, what time works for the weekly marketing review?\nsarah: My office at 4pm — Mondays?\npedro: perfect, let's lock that in. By the way I usually take Fridays off so don't schedule anything for me on Fridays.",
    extracted: [
      {
        kind: 'context',
        body: 'Weekly marketing review with Sarah at her office on Mondays at 4pm',
        confidence: 0.9,
        sourceContext: "let's lock that in",
      },
      {
        kind: 'relationship',
        body: 'Sarah handles marketing reviews from her office',
        confidence: 0.85,
        sourceContext: 'Sarah, what time works for the weekly marketing review',
      },
      {
        kind: 'preference',
        body: 'Takes Fridays off',
        confidence: 0.95,
        sourceContext: 'I usually take Fridays off',
      },
    ],
  },
  {
    user: "Tech stack I'm settling on for the new side project: Bun + Hono on the backend, SQLite for storage, Vite + Solid on the frontend. Skipping React this time — Solid's reactivity model is way nicer.",
    extracted: [
      {
        kind: 'skill',
        body: 'Uses Bun and Hono on the backend',
        confidence: 0.95,
        sourceContext: 'Bun + Hono on the backend',
      },
      {
        kind: 'skill',
        body: 'Uses SQLite for storage',
        confidence: 0.95,
        sourceContext: 'SQLite for storage',
      },
      {
        kind: 'skill',
        body: 'Uses Vite and Solid on the frontend',
        confidence: 0.95,
        sourceContext: 'Vite + Solid on the frontend',
      },
      {
        kind: 'preference',
        body: 'Prefers Solid over React for new projects, citing the reactivity model',
        confidence: 0.9,
        sourceContext: "Solid's reactivity model is way nicer",
      },
    ],
  },
  {
    user: "Quick reminder to myself: I'm in London. I work in product. I'm in London and I work in product. Mostly writing this so my future self knows nothing has changed.",
    extracted: [
      {
        kind: 'fact',
        body: 'Lives in London',
        confidence: 0.95,
        sourceContext: "I'm in London",
      },
      {
        kind: 'fact',
        body: 'Works in product',
        confidence: 0.95,
        sourceContext: 'I work in product',
      },
    ],
  },
  {
    user: 'Speaker: pedro\n\nstandup yest — closed 3 tickets, paired w/ karim on auth refactor, deployed staging. today — finishing migration, design review at 3. blockers — none.',
    extracted: [
      {
        kind: 'event',
        body: 'Closed three tickets yesterday',
        confidence: 0.95,
        sourceContext: 'closed 3 tickets',
      },
      {
        kind: 'event',
        body: 'Paired with Karim on the auth refactor yesterday',
        confidence: 0.95,
        sourceContext: 'paired w/ karim on auth refactor',
      },
      {
        kind: 'context',
        body: 'Finishing the migration today; design review at 3pm',
        confidence: 0.9,
        sourceContext: 'finishing migration, design review at 3',
      },
      {
        kind: 'relationship',
        body: 'Karim is a pairing collaborator on the auth refactor',
        confidence: 0.85,
        sourceContext: 'paired w/ karim',
      },
    ],
  },
] as const
