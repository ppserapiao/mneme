# @mneme/protocol

The canonical types and runtime schemas for the **Mneme Protocol** — the open, versioned spec for user-sovereign AI memory.

This package is intentionally tiny and dependency-light. It contains:

- The `MemoryRecord` schema and supporting types (`MemoryKind`, `Payload`, `MemoryMetadata`, `MemoryLifecycle`)
- The `MnemeStore` verb interface that every Protocol implementation must satisfy
- Branded ID types (`MemoryId`, `OwnerId`, `DeviceId`) with Zod validators
- The protocol version constant
- The `MnemeError` class and its closed set of error codes

You almost never import this package directly. Use [`@mneme/sdk`](../sdk) for the developer-facing API. Import `@mneme/protocol` only when you are:

1. Building an alternative implementation of the Mneme Protocol
2. Validating a `MemoryRecord` received over the wire
3. Writing tools that need the canonical types (eval harnesses, codegen, etc.)

## Reading the spec

The wire-level, vendor-neutral specification lives at [`docs/protocol/`](../../docs/protocol). This package is the TypeScript reflection of that spec — they MUST be kept in lockstep.

## License

Apache-2.0.
