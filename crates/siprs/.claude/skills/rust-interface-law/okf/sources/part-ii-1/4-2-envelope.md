---
type: "Section"
title: "4.2 Envelope"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/4-2-envelope"
    title: "4.2 Envelope"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/4-2-envelope"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "668-668"
---
### 4.2 Envelope

| ID | Rule | Verification |
|---|---|---|
| OPS-01 | Every operation MUST have a stable `operation_id` and a typed request/response pair. | V1 types; V3 catalog test. |
| OPS-02 | The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`. | V3 schema test. |
| OPS-03 | `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease. | V1 type; V3 rejection test. |
| OPS-04 | `request_id` MUST be generated when absent and MUST be stable across retries of the same logical request. | V3 test. |
| OPS-05 | The execution pipeline MUST follow this order: decode/size → authenticate or establish anonymity → authentication requirement → scope → deadline/admission → generated input validation → idempotency claim → replay branch (`replay_authorize` then stored result) or acquire branch (`prepare` then execute) → commit/outbox → result/reply. | V3 instrumented pipeline test. |
| OPS-06 | No side effect MAY occur before authorization succeeds. | V3 failure-injection test. |
| OPS-07 | Authorization MUST run inside the operation, not only in the adapter. | V3 bypass test. |
| OPS-08 | Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone. | V3 cross-tenant test. |
| OPS-09 | Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict. | V3 test. |
| OPS-10 | Mutations that touch multiple resources MUST use a transaction or a compensating action. | V3 failure-injection test. |
| OPS-11 | Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics. | V3 streaming test. |
| OPS-12 | One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden. | V2 import/scan; V4 review. |
| OPS-13 | Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`. | V2 import scan. |
| OPS-14 | An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden. | V1 type; V3 test. |
| OPS-15 | Every operation MUST publish domain events only after commit. | V3 test. |
| OPS-16 | Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior. | V3 rule coverage. |
| OPS-17 | `ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it. | V1/V2 visibility; V3 test. |
| OPS-18 | The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic. | V3 test. |

**Rationale for OPS-05 and OPS-07.** Interfaces are replaceable; authorization
is not. If authorization lives only in the REST middleware, the CLI and MCP
paths become authorization bypasses. The operation is the only place every
interface must pass through.

---

## 5. Identity and Authentication

## Rules in this section

- [OPS-01 — Every operation MUST have a stable `operation_id` and a typed request/respons...](../../rules/c/ops-01.md)
- [OPS-02 — The wire envelope MUST be `{context, request}` and the reply `{request_id, re...](../../rules/c/ops-02.md)
- [OPS-03 — `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace...](../../rules/c/ops-03.md)
- [OPS-04 — `request_id` MUST be generated when absent and MUST be stable across retries ...](../../rules/g/ops-04.md)
- [OPS-05 — The execution pipeline MUST follow this order: decode/size → authenticate or ...](../../rules/g/ops-05.md)
- [OPS-06 — No side effect MAY occur before authorization succeeds.](../../rules/c/ops-06.md)
- [OPS-07 — Authorization MUST run inside the operation, not only in the adapter.](../../rules/c/ops-07.md)
- [OPS-08 — Tenant and ownership MUST be derived from `VerifiedIdentity` and the target r...](../../rules/c/ops-08.md)
- [OPS-09 — Mutating operations MUST define idempotency semantics: same key + same canoni...](../../rules/c/ops-09.md)
- [OPS-10 — Mutations that touch multiple resources MUST use a transaction or a compensat...](../../rules/c/ops-10.md)
- [OPS-11 — Streaming operations MUST declare their mode and MUST define EOF, error, canc...](../../rules/c/ops-11.md)
- [OPS-12 — One operation MUST have one handler. Adapter-specific branching inside the ha...](../../rules/c/ops-12.md)
- [OPS-13 — Operation inputs and outputs MUST be protocol-independent. Protobuf-generated...](../../rules/g/ops-13.md)
- [OPS-14 — An operation MUST declare `AuthenticationRequirement::Required` or `Authentic...](../../rules/c/ops-14.md)
- [OPS-15 — Every operation MUST publish domain events only after commit.](../../rules/c/ops-15.md)
- [OPS-16 — Every operation MUST have a conformance identifier and at least one oracle fo...](../../rules/c/ops-16.md)
- [OPS-17 — `ErasedPrepared` MUST be opaque: it preserves the authentication kind and ope...](../../rules/c/ops-17.md)
- [OPS-18 — The generated `ContractValidate::validate()` MUST run in the common dispatch ...](../../rules/g/ops-18.md)

