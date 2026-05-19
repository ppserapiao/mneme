# @mneme/embedder-local

On-device embeddings for [`@mneme/sdk`](../sdk), backed by [`@huggingface/transformers`](https://huggingface.co/docs/transformers.js). Drop it in to upgrade `recall()` from lexical BM25 to true semantic search — no API key, no hosted service, no data leaving the machine.

## Install

```sh
bun add @mneme/sdk @mneme/embedder-local
# or npm i @mneme/sdk @mneme/embedder-local
```

## Use

```ts
import { Mneme } from '@mneme/sdk'
import { LocalEmbedder } from '@mneme/embedder-local'

const mneme = new Mneme({ embedder: new LocalEmbedder() })

await mneme.remember({
  kind: 'preference',
  body: 'Prefers concise code review comments',
})

// "feedback style" never appears literally in any stored memory.
// Semantic recall finds it anyway.
const matches = await mneme.recall('feedback style on pull requests')
console.log(matches[0]?.record.body)
```

The first call to `embed()` downloads the model (~25 MB for the default
`Xenova/all-MiniLM-L6-v2`). Subsequent calls reuse the cache in the platform's
standard transformers.js cache directory.

## Choosing a model

```ts
new LocalEmbedder({
  model: 'Xenova/multilingual-e5-small', // example
  dimensions: 384,
})
```

The default is the right choice for most English-language use cases. Use a
multilingual or larger model if your inputs justify the extra weight. Whatever
model you pick must produce L2-normalised mean-pooled vectors (sentence-
transformers compatible). The `dimensions` option must match the model output.

## How it relates to the SDK

`LocalEmbedder` implements the [`Embedder`](../sdk/src/embedder/types.ts) interface exported by `@mneme/sdk`. The SDK uses it on every plaintext `remember()` to store an embedding, and on every `recall()` to rank candidates by cosine similarity. Records written before an embedder is configured remain in the store but are invisible to semantic search until re-embedded (re-embedding migration ships in a later version).

See [ADR 0004](../../decisions/0004-local-first-embedding-strategy.md) for the rationale behind the model choice, the single-embedder-per-store constraint in v0.0.2, and why this package is separate from `@mneme/sdk`.

## Running the integration tests

Shape tests run by default. Real-model integration tests are gated behind an
environment variable because Bun 1.3.x crashes on process exit when
`onnxruntime-node`'s native addon is loaded — the tests themselves pass, but
the non-zero exit code breaks CI. Until upstream lands a fix, run them
manually:

```sh
MNEME_RUN_INTEGRATION=1 bun test packages/embedder-local
```

CI tracks the underlying Bun + ONNX issue and will flip this default back to
opt-out as soon as it's resolved.

## License

Apache-2.0.
