---
type: "Rule"
title: "INV-06 — Conformance tests, not documentation, prove compliance."
description: "Conformance tests, not documentation, prove compliance."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "inv-06"
    title: "INV-06"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "conformance driver"
x-parent: "INV"
x-phase: "core"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "INV-06"
x-source-part: "Part II"
x-source-span: "591-591"
x-verification: "V4 review."
---
# INV-06

Conformance tests, not documentation, prove compliance.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | INV |
| Source part | Part II |
| Verification | V4 review. |
| Enforcement | conformance driver |

[2. Invariants](../../sources/part-ii-1/2-invariants.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [IF-02 — An adapter MUST NOT implement business rules, authorization policy, or persis...](if-02.md)
- [IF-01 — An adapter MUST only: extract credentials, convert input, call the verifier, ...](if-01.md)
- [OPS-07 — Authorization MUST run inside the operation, not only in the adapter.](ops-07.md)
- [ARC-03 — `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*...](arc-03.md)
- [CONF-42 — After SSO is added, existing operation signatures, subject IDs, and business ...](../p/conf-42.md)
- [AUTH-08 — `aud` MUST identify one interface or resource. Wildcard audiences are forbidd...](auth-08.md)
- [OPS-06 — No side effect MAY occur before authorization succeeds.](ops-06.md)

[^inv-06]: sources/EXPERT-REVIEW-PACKAGE.md

