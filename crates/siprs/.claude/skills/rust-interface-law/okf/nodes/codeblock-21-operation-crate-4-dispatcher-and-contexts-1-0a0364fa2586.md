---
type: CodeBlock
id: codeblock/21-operation-crate-4-dispatcher-and-contexts/1/0a0364fa2586
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0a0364fa2586acd99cf2097d4cd70501e04fa6adcf9b673b7f5b140c86f5c151
source: sources/21-OPERATION.md
---
```rust
let dispatcher = Dispatcher::new(
    Arc::new(registry),
    Arc::new(jwt_verifier),
    Arc::new(idempotency_store),
    Arc::new(result_store),
    Arc::new(revocation_checker),
    clock_fn,
    DispatchLimits { /* ... */ },
);
```
