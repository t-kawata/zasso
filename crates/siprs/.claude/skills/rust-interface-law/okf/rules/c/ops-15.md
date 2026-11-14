---
type: "Rule"
title: "OPS-15 — Every operation MUST publish domain events only after commit."
description: "Every operation MUST publish domain events only after commit."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "ops-15"
    title: "OPS-15"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "OPS"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OPS-15"
x-source-part: "Part II"
x-source-span: "357-357"
x-verification: "V3 test."
---
# OPS-15

Every operation MUST publish domain events only after commit.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OPS |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[4.2 Envelope](../../sources/part-ii-1/4-2-envelope.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [OPS-01 — Every operation MUST have a stable `operation_id` and a typed request/respons...](ops-01.md)
- [OPS-02 — The wire envelope MUST be `{context, request}` and the reply `{request_id, re...](ops-02.md)
- [OPS-03 — `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace...](ops-03.md)
- [OPS-04 — `request_id` MUST be generated when absent and MUST be stable across retries ...](../g/ops-04.md)
- [OPS-05 — The execution pipeline MUST follow this order: decode/size → authenticate or ...](../g/ops-05.md)
- [OPS-06 — No side effect MAY occur before authorization succeeds.](ops-06.md)
- [OPS-07 — Authorization MUST run inside the operation, not only in the adapter.](ops-07.md)
- [OPS-08 — Tenant and ownership MUST be derived from `VerifiedIdentity` and the target r...](ops-08.md)
- [OPS-09 — Mutating operations MUST define idempotency semantics: same key + same canoni...](ops-09.md)
- [OPS-10 — Mutations that touch multiple resources MUST use a transaction or a compensat...](ops-10.md)
- [OPS-11 — Streaming operations MUST declare their mode and MUST define EOF, error, canc...](ops-11.md)
- [OPS-12 — One operation MUST have one handler. Adapter-specific branching inside the ha...](ops-12.md)
- [OPS-13 — Operation inputs and outputs MUST be protocol-independent. Protobuf-generated...](../g/ops-13.md)
- [OPS-14 — An operation MUST declare `AuthenticationRequirement::Required` or `Authentic...](ops-14.md)
- [OPS-16 — Every operation MUST have a conformance identifier and at least one oracle fo...](ops-16.md)
- [OPS-17 — `ErasedPrepared` MUST be opaque: it preserves the authentication kind and ope...](ops-17.md)
- [OPS-18 — The generated `ContractValidate::validate()` MUST run in the common dispatch ...](../g/ops-18.md)

[^ops-15]: sources/EXPERT-REVIEW-PACKAGE.md

