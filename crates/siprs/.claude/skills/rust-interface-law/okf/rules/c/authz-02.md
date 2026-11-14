---
type: "Rule"
title: "AUTHZ-02 — Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked."
description: "Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "authz-02"
    title: "AUTHZ-02"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "negative-auth suite"
x-parent: "AUTHZ"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "AUTHZ-02"
x-source-part: "Part II"
x-source-span: "91-91"
x-verification: "V3 test."
---
# AUTHZ-02

Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | AUTHZ |
| Source part | Part II |
| Verification | V3 test. |
| Enforcement | negative-auth suite |

[7. Authorization](../../sources/part-ii-1/7-authorization.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [AUTHZ-01 — Authorization MUST be expressed as `Authorizer::require(identity, action, res...](authz-01.md)
- [AUTHZ-03 — Tenant and owner checks MUST use the identity and the loaded resource, not re...](authz-03.md)
- [AUTHZ-04 — Anonymous operations MUST be explicitly declared. `Option<Identity>` must not...](authz-04.md)
- [AUTHZ-05 — A target in another tenant MUST return not-found. A target in the caller's te...](authz-05.md)
- [AUTHZ-06 — Scope strings MUST NOT be compared in handlers or adapters; policy belongs in...](authz-06.md)
- [AUTHZ-07 — Authorization and mutation races MUST be handled with a transaction or a cond...](authz-07.md)
- [AUTHZ-08 — An interface-level pre-check MAY exist, but it MUST NOT replace the operation...](authz-08.md)
- [AUTHZ-09 — The same identity, action, and resource MUST produce the same authorization r...](authz-09.md)

[^authz-02]: sources/EXPERT-REVIEW-PACKAGE.md

