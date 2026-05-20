# 0012 — Distiller architecture (LLM-powered memory extraction)

**Status**: Accepted
**Date**: 2026-05-20

## Context

Through v0.1.1 the SDK requires the user (or an integrating app) to manually call `mneme.remember({ kind, body })` for every memory. That's the right floor — explicit, predictable, no surprises. It is also the entire reason mneme demos as a "database" today and not as a "memory companion."

The single highest-leverage feature we can ship to change that — and the one that unlocks the most viral demos and the strongest acquisition narrative — is **automatic extraction of memories from raw text**: paste a conversation transcript, a Slack thread, a journal entry; mneme decides what's durable, classifies it, and writes it. That's the line between *"a small SQLite for AI"* and *"the memory layer for AI."*

Doing this elite-grade requires answering five design questions:

1. **Where does the LLM call live?** SDK core, or an optional adapter?
2. **Whose key pays for the call?** Ours, or the user's?
3. **What's the wire format that survives malformed-JSON disasters?**
4. **How do we make this cheap enough that users actually leave it on?**
5. **What's the failure surface — what happens when Anthropic rate-limits, or the model returns an unparseable response?**

This ADR locks the answers.

## Decision

### 1. Distiller is an SDK-level adapter, not a protocol verb

The protocol (`@mnemehq/protocol` v0.1) has six verbs: `remember`, `recall`, `forget`, `supersede`, `get`, `export`. Distillation is not a seventh verb. It is an SDK-level convenience that internally fans out to N `remember()` calls.

Why: the protocol is the open wire spec other implementations must conform to. Forcing a Python or Rust port of mneme to also ship an LLM extractor would be an unreasonable barrier. Keeping distillation as an SDK feature lets each implementation choose its own extraction strategy — or skip it entirely and rely on the host app to call `remember()` directly.

Concretely: add a `Distiller` interface to `@mnemehq/sdk`, plus a `mneme.distill(text)` method that calls the configured distiller and persists the result.

```ts
export interface Distiller {
  readonly name: string
  distill(input: DistillInput): Promise<DistillOutput>
}

class Mneme {
  async distill(text: string, options?: DistillOptions): Promise<DistillResult>
}
```

This is the same pattern as `Embedder` (ADR 0004): a typed interface in the SDK, separate npm packages for each concrete implementation. The SDK does not depend on any LLM provider's SDK.

### 2. BYO-key — the user pays Anthropic / OpenAI directly

We never proxy LLM calls. The user constructs a distiller with their own API key:

```ts
const distiller = new ClaudeDistiller({ apiKey: process.env.ANTHROPIC_KEY })
```

The SDK passes the distiller forward; the adapter speaks directly to Anthropic. We never see the API key, the prompt, or the response. **The thesis ("your data, your keys") extends naturally to the LLM call.**

Three trust tiers as packages mature:

| Package | API key | Plaintext leaves device? |
| --- | --- | --- |
| `@mnemehq/distiller-claude` (this ADR) | User's Anthropic key | Yes, to Anthropic (user's terms with Anthropic apply) |
| `@mnemehq/distiller-openai` (next minor) | User's OpenAI key | Yes, to OpenAI |
| `@mnemehq/distiller-local` (later — gated on ADR 0004 §4 cleanup) | None | No — runs locally on llama.cpp / transformers.js |

A future Mneme Cloud paid tier *could* offer a hosted distillation service (with explicit user opt-in and a clear "we briefly see plaintext during distillation" notice), but the open-source default is BYO-key forever.

### 3. Structured output via Anthropic tool-use — not free-form JSON parsing

The naive approach — ask the LLM to "respond with JSON" and `JSON.parse()` the result — is fragile. Models hallucinate trailing commas, embed prose, forget brackets. We've all read those postmortems.

Anthropic's tool-use API forces the response into a JSON-schema-validated shape. We define a `record_memories` tool with a Zod schema; Claude returns a `tool_use` block whose `input` field is guaranteed to validate against the schema. No regex, no `JSON.parse()` defensive coding, no "did it close the bracket" prayers.

```ts
const ExtractedMemorySchema = z.object({
  kind: MemoryKindSchema,
  body: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  sourceContext: z.string().optional(),
})
const ExtractionSchema = z.object({
  memories: z.array(ExtractedMemorySchema),
})
```

The adapter validates with Zod a second time on receipt — belt-and-braces. If validation fails despite tool-use (theoretically impossible but real models surprise you), the adapter retries once with stricter prompting before failing.

### 4. Anthropic prompt caching enabled by default

The system prompt + few-shot examples are stable across distillation calls and large (~2-3k tokens). Anthropic's prompt-cache API marks blocks as cacheable and discounts cached input tokens by ~90% on hits, valid for 5 minutes after each use.

This is real money: a user distilling 20 conversations in a session pays full input cost once and ~10% on each subsequent call. Without caching, every distillation is ~$0.005-0.015 in input cost; with caching, the marginal call is ~$0.0005-0.0015. **Enabled by default in the adapter — no flag needed.**

This becomes a quotable line in the README: *"distill 20 conversations for the price of 1.5."*

### 5. Production-grade error surface

Concrete failure modes the adapter handles, not the user:

| Failure | Behaviour |
| --- | --- |
| `429 Too Many Requests` | Exponential backoff (250ms → 500ms → 1s → 2s), 4 attempts |
| `5xx` from Anthropic | Same backoff |
| `MnemeError('cost_exceeded')` if `maxCostUsd` budget would be blown | Aborts before the call, returns clean error |
| Tool-use block missing from response | Retry once with stricter prompt; fail with `MnemeError('distill_no_tool_use')` if second attempt fails |
| Zod validation of tool input fails | Same retry behaviour |
| Empty input text | `MnemeError('distill_empty_input')`, no LLM call |
| Network timeout (default 30s) | `MnemeError('distill_timeout')`, configurable |

The adapter exposes a `onDistillEvent` hook for observability:

```ts
new ClaudeDistiller({
  apiKey: '...',
  onEvent: (e) => logger.info(e),  // { type: 'request' | 'retry' | 'response' | 'error', ... }
})
```

### 6. The Mneme.distill() flow

```ts
class Mneme {
  async distill(
    text: string,
    options?: {
      sourceApp?: string         // tag every extracted memory with this
      minConfidence?: number     // default 0.5 — skip below
      hint?: { speakerLabel?: string; maxMemories?: number }
    },
  ): Promise<{
    written: MemoryRecord[]
    skipped: number              // below confidence threshold
    usage: { promptTokens; completionTokens; costUsdEstimate }
    model: string
  }>
}
```

It calls the configured distiller, then for each extracted memory above `minConfidence`, calls `this.remember()`. The user's existing signing, encryption, embedding pipeline runs unchanged — distillation is the front door, not a bypass.

If no distiller is configured: throws `MnemeError('distiller_not_configured', '...')` immediately. The error message points at the docs page on setting one up.

### 7. The prompt

The system prompt + the tool schema together are the product. Quality lives here. Initial design:

- **Persona**: "You extract durable, useful memories about the speaker. You DO NOT extract opinions about the world, third-party gossip, or fleeting moods."
- **6 kinds aligned to `MemoryKindSchema`**: `preference`, `fact`, `event`, `opinion`, `goal`, `relationship`.
- **Strict rules**: third-person voice, max 500 chars per memory, single self-contained sentence.
- **Confidence rubric**: 0.9+ explicit, 0.6-0.8 inferred, below 0.5 skipped by default.
- **3 high-quality few-shot examples** spanning conversational, journal, and Slack-thread inputs — these get cached.

Prompts live in `packages/distiller-claude/src/prompts.ts` so they can be versioned, evaluated, and updated independently. ADR 0013 (forthcoming, after the eval harness ships) will lock the prompt versioning + eval pipeline.

## Consequences

### Positive

- **The viral demo shifts from "manual storage" to "automatic memory companion."** Paste a chat transcript, watch mneme extract 12 useful memories in 3 seconds.
- **Acquisition narrative gains a working "intelligent feature."** Acquirers can see we're not just plumbing — we ship sophisticated, well-engineered AI features without compromising the local-first thesis.
- **Cost is transparent and low.** BYO-key + prompt caching means the per-user marginal cost is roughly $0 to us and ~$0.001-0.005 per distillation to the user.
- **Failure modes are bounded.** Every error path either retries or surfaces a typed `MnemeError`. No silent corruption, no half-written batches (each `remember()` is its own transaction).

### Negative

- **The user must obtain and manage an Anthropic API key.** Friction for non-developer users. Partially mitigated by docs and (later) `@mnemehq/distiller-local`.
- **The prompt is now part of the surface we maintain.** Models drift; prompts that work today may not work in 18 months. The eval harness (next PR) is the load-bearing thing that catches drift.
- **Extraction quality is a moving target.** "Did it extract the right memories?" is subjective until we have the eval. Until then, we ship with the prompt we've engineered and a tight feedback loop.
- **One more provider dependency in the supply chain.** `@anthropic-ai/sdk` is now a peer dep of `@mnemehq/distiller-claude`. Pinned to a minor range, reviewed on every bump.

## Alternatives considered

- **Build distillation into the protocol as a 7th verb.** Rejected — see §1. Forcing every implementation to ship LLM-aware code is the wrong abstraction. Distillation belongs above the protocol layer.
- **Free-form JSON output + tolerant parsing.** Rejected for the obvious reason. Tool-use is the typed path the model provider supports natively.
- **Proxy LLM calls through a Mneme-hosted endpoint** (so users don't need their own key). Rejected — violates the thesis (we'd see plaintext), introduces cost-on-us risk, and is operationally harder. Revisit if a paying enterprise tier specifically asks for it.
- **Pluggable extraction schemas (user provides their own kinds + Zod schema).** Considered. Deferred to v0.2 — adds complexity for a use case nobody has actually asked for yet. Today's 6 kinds cover the demonstrated need.
- **Streaming distillation** (emit memories as they're extracted from a long transcript). Real UX improvement for very long inputs. Deferred to v0.2 — pulls in stream handling on both the adapter and the SDK side, and the first-rev value is at single-message inputs.
- **`@mnemehq/distiller-openai` in this same PR**. Considered. Deferred to the next minor (one PR after this lands) because the design lives in this ADR — the second adapter is a ~2-hour copy of the first against a different SDK. Shipping both in one PR slows review and conflates risk.
- **A `@mnemehq/distiller` umbrella package** that exposes `claudeDistiller` / `openaiDistiller` / etc. as named exports. Considered. Rejected because it forces users who only want Claude to also install OpenAI's SDK transitively. The pattern matches `@mnemehq/embedder-local` — one adapter per package, opt in to what you use.
