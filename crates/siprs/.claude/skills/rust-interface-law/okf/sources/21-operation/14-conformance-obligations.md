---
type: "Section"
title: "14. Conformance Obligations"
description: "1. Every catalog operation is registered exactly once."
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "21-operation-14-conformance-obligations"
    title: "14. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/21-OPERATION.md"
x-source-span: "367-382"
---
## 14. Conformance Obligations

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

