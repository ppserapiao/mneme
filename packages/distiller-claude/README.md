# @mnemehq/distiller-claude

Anthropic-backed memory distiller for [`@mnemehq/sdk`](../sdk). Pass raw text — a conversation transcript, a journal entry, a meeting note — and Claude extracts structured memories that mneme persists for you.

> Status: `v0.1.0` — first npm release. Pairs with [`@mnemehq/sdk`](../sdk) `^0.1.2`. ADR 0012 for the full design.

## Why

The SDK on its own requires you to call `remember()` manually for every memory. Useful for explicit writes; brutal for converting a chat transcript into useful long-term memory. The distiller closes that gap:

```ts
import { Mneme } from '@mnemehq/sdk'
import { ClaudeDistiller } from '@mnemehq/distiller-claude'

const mneme = await Mneme.open({
  passphrase: 'correct horse battery staple',
  distiller: new ClaudeDistiller({ apiKey: process.env.ANTHROPIC_API_KEY }),
})

await mneme.distill(`
  Had a great espresso on Brick Lane. Reminded me I really prefer single-origin
  to blends. Also — Sarah from marketing is replying super fast on Slack DMs,
  much faster than email. Should make that the default channel.
`)

// → mneme.remember() called automatically for each extraction:
//   { kind: 'event',        body: 'Visited the espresso bar on Brick Lane' }
//   { kind: 'preference',   body: 'Prefers single-origin coffee over blends' }
//   { kind: 'relationship', body: 'Sarah works in marketing' }
//   { kind: 'preference',   body: 'Prefers Slack DMs over email for reaching Sarah in marketing' }
```

## Install

```sh
bun add @mnemehq/sdk @mnemehq/distiller-claude
```

Requires Bun `>= 1.3`. The Anthropic SDK is pulled in transitively.

## How it works

- **Bring your own key.** The distiller calls Anthropic with the API key you provide. The mneme infra never sees your key, your prompts, or your responses. The thesis — *your data, your keys* — extends to the LLM call.
- **Tool-use, not JSON.parse.** Claude returns a `tool_use` block validated against a Zod schema. No regex parsing, no malformed-JSON debugging.
- **Prompt caching enabled by default.** The system prompt + few-shot examples (~2-3k tokens, stable across calls) are marked `cache_control: ephemeral`. Subsequent distillations within ~5 minutes pay ~10% of the input token cost. Distill 20 conversations for the price of 1.5.
- **Retries 429 / 5xx / transient errors** with exponential backoff (250ms → 500ms → 1s → 2s, ±25% jitter), up to 4 attempts by default.
- **Cost estimation per call.** Every `distill()` returns `usage.costUsdEstimate` so you can budget. Bound it hard with `maxCostUsdPerCall`.
- **Observability hook** for logging every request, retry, response, and error.

## Default model

`claude-sonnet-4-6` — capable extraction quality at ~$0.001-0.005 per distillation (cache-warm). Override:

```ts
new ClaudeDistiller({ apiKey: '...', model: 'claude-opus-4-7' })
new ClaudeDistiller({ apiKey: '...', model: 'claude-haiku-4-5' })
```

We maintain a small price table covering the current Sonnet / Haiku / Opus tiers so `costUsdEstimate` stays meaningful. Unknown models report `0` (the adapter still works; you just lose the cost estimate).

## Options

```ts
new ClaudeDistiller({
  apiKey: process.env.ANTHROPIC_API_KEY!,         // required
  model: 'claude-sonnet-4-6',                     // default
  maxOutputTokens: 2048,                          // covers ~10-15 memories
  requestTimeoutMs: 30_000,                       // 30s
  maxRetries: 4,                                  // 429 / 5xx backoff
  maxCostUsdPerCall: 0.10,                        // hard ceiling, default Infinity
  disablePromptCaching: false,                    // caching ON by default
  onEvent: (e) => console.log(e),                 // observability
})
```

For tests, swap the real client out:

```ts
new ClaudeDistiller({
  client: stubAnthropicClient,                    // any { messages: ... }
})
```

## Errors

| Cause | Surfaced as |
| --- | --- |
| Empty `text` input | `MnemeError('invalid_record', ...)` |
| Missing `apiKey` (and no stubbed `client`) | `MnemeError('invalid_record', ...)` |
| Cost would exceed `maxCostUsdPerCall` | `MnemeError('invalid_record', ...)` with the projected cost |
| 429 / 5xx / network errors after `maxRetries` exhausted | Underlying error rethrown |
| Tool-use block missing from response | `Error('Claude did not return a tool_use block ...')` |
| Tool input fails Zod validation | `ZodError` rethrown |

The adapter never silently returns partial results. Either the full extraction succeeds or it throws.

## What it extracts

Six categories aligned to the mneme protocol's `MemoryKind`:

| Kind | What it means |
| --- | --- |
| `fact` | Durable, verifiable information about the speaker (location, identity, allergies, possessions) |
| `preference` | Likes, dislikes, opinions held over time |
| `event` | Specific things that happened, with rough time context |
| `relationship` | Named people in the speaker's life |
| `context` | Current ongoing situation, project, or theme |
| `skill` | Abilities, expertise, or active learning |

The system prompt explicitly tells Claude to refuse third-party gossip, hypotheticals, fleeting moods, and questions. Confidence rubric: 0.95+ for explicit statements, ~0.75 for strong implications, ~0.55 for inference, below 0.5 skipped by the SDK default.

## What's coming

- **`@mnemehq/distiller-openai`** — same interface, OpenAI key (next minor release; the adapter copy-paste against `openai`'s SDK is ~2 hours of work)
- **`@mnemehq/distiller-local`** — on-device extraction via `llama.cpp` / `transformers.js`. Gated on resolving the Bun + onnxruntime cleanup issue (ADR 0004 §4)
- **Streaming distillation** for long transcripts — adapter emits memories as they're extracted (v0.2)
- **Eval harness** — curated corpus + queries with expected top matches, measuring extraction precision (ADR 0013, next PR after this one)

## License

Apache-2.0.
