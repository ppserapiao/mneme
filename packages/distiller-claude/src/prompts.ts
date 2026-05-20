/**
 * Distillation prompts for ClaudeDistiller (ADR 0012 §7).
 *
 * The system prompt and the tool schema together ARE the product. They get
 * versioned, evaluated, and updated independently of the adapter code. Prompt
 * + schema changes that affect output shape get a bump in `PROMPT_VERSION`
 * so the upcoming eval harness (ADR 0013) can pin a specific revision.
 *
 * Anthropic's prompt-cache API tags large stable blocks as cacheable. The
 * system prompt + few-shot examples below are ~2-3k tokens, marked cacheable,
 * and produce a ~90% input-cost discount on cache hits within a 5-minute TTL.
 */

export const PROMPT_VERSION = '2026-05-20a'

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

export const SYSTEM_PROMPT = `You extract durable, useful memories about a single speaker from raw text. The text may be a conversation transcript, a journal entry, a meeting note, or a chat message.

Your job is to identify the *kind* of memory worth keeping, distill each one into a single self-contained sentence, and call the \`record_memories\` tool with a structured list.

CATEGORIES (use these exact values for "kind"):
  - fact          — durable, verifiable information about the speaker (location, role, identity, possessions, allergies, fixed details about their life)
  - preference    — things the speaker likes, dislikes, or prefers; opinions held over time
  - event         — specific things that happened to the speaker, with rough time context
  - relationship  — named people in the speaker's life and how they relate (colleague Sarah, partner Mark, dog Hazel)
  - context       — current ongoing situation, project, or theme the speaker is engaged with
  - skill         — abilities, expertise, or things the speaker is learning

WHAT TO EXTRACT
- Anything the speaker states explicitly about themselves
- Things they imply strongly enough that a reasonable reader would record them
- Updates to previously held positions ("used to drink Nespresso, now into single-origin")
- Current concerns and commitments (working on X, attending Y next week)

WHAT NOT TO EXTRACT
- Third-party information that doesn't involve the speaker (gossip about colleagues; news headlines they mention)
- Hypotheticals, brainstorms, "what if" musings
- Generic statements that aren't specific to this person
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

QUANTITY
- Aim for the smallest number of memories that captures the durable signal
- Soft cap: if the input mentions a few facts, emit a few memories. If it's a long ramble, prefer 5-10 high-quality memories over 30 thin ones.
- If the input contains nothing memorable about the speaker, return an empty list. Quality > quantity.

CALL THE TOOL. Do not respond with prose.`

/**
 * Few-shot examples. Sent as alternating user/assistant turns so the model
 * sees real input → expected tool call mappings. Marked cacheable by the
 * adapter on every request.
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
] as const
