---
type: List
id: list/21-operation-crate-14-conformance-obligations/1/443c70975f15
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 443c70975f15407b6dae71ad93cd59aa5a0cc558564d1285089250c67c715cd1
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
1. Every catalog operation is registered exactly once.
2. Every authenticated operation has `prepare` that authorizes before mutation.
3. Every anonymous operation executes without a `VerifiedIdentity`.
4. Replay re-authorizes.
5. Concurrent idempotent claims produce one execution.
6. A crash after commit is recovered by the outbox/idempotency policy.
7. Irreversible effects follow the declared recovery policy.
8. No `InterfaceId` branching in operation code.
9. `cargo test -p <project>-operation` and `cargo clippy -p
   <project>-operation -- -D warnings`.
10. The conformance report names `OP-01` through `OP-12`, `OP-AUTH-01` through
    `OP-AUTH-05`, `OP-IDEM-01` through `OP-IDEM-10`, and `OP-TX-01` through
    `OP-TX-06`.
