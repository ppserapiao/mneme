# @mneme/conformance

Cross-implementation conformance suite for the [mneme Protocol](../../docs/protocol/v0.1.md).

An implementation is **v0.1-conforming** if and only if every test in this package passes against its `MnemeStore` interface, with no skips.

## Running the suite against the reference SDK

```sh
bun test tests/conformance
```

This runs the suite against `@mneme/sdk`'s `SqliteStore` via `src/sqlite-store.test.ts`.

## Running it against a new implementation

```ts
import { runV01ConformanceSuite } from '@mneme/conformance'
import { MyStore } from './my-store'

runV01ConformanceSuite('MyStore', async () => {
  const store = new MyStore({ /* … */ })
  return {
    store,
    dispose: () => store.close(),
  }
})
```

Save the file as `*.test.ts` anywhere in your repo and run `bun test`. The suite calls your factory before every test and `dispose()` after, so each test gets a fresh store with no cross-test leakage.

## What's covered in v0.1

- WRITE → READ round-trip
- Owner isolation (cross-owner READ returns `null`)
- SEARCH ranks matches and excludes non-matches
- FORGET hides records from SEARCH
- SUPERSEDE chains records via `lifecycle.supersededBy`
- EXPORT streams every record for an owner
- FORGET on unknown IDs raises `record_not_found`

Extensions for v0.2 (sync, OBSERVE, encrypted payload mode, MCP mapping) will be added under `tests/conformance/v0.2/` when those protocol sections land. Suites are additive — v0.1 conformance MUST keep passing across all protocol versions until v1.0.

## License

Apache-2.0.
