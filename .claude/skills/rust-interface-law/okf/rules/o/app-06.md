---
type: "Rule"
title: "APP-06 — Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset."
description: "Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "app-06"
    title: "APP-06"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "rules coverage check"
x-parent: "APP"
x-phase: "scope"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "O"
x-rule-id: "APP-06"
x-source-part: "Part II"
x-source-span: "47-47"
x-verification: "V4 review; project plan."
---
# APP-06

Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset.

| Field | Value |
|---|---|
| Class | O |
| Applies to | all |
| Parent | APP |
| Source part | Part II |
| Verification | V4 review; project plan. |
| Enforcement | rules coverage check |

[12.3 Application rules](../../sources/part-ii-1/12-3-application-rules.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [APP-02 — A project MUST maintain an operation catalog using the §11 template.](app-02.md)
- [APP-03 — A project MUST map its crates to §3.1 roles and record the mapping.](app-03.md)
- [APP-04 — Exceptions MUST be declared with a reason, scope, owner, and expiry. Undeclar...](app-04.md)
- [APP-05 — This document is versioned. A project pins the version it applies.](app-05.md)
- [APP-07 — Each adopted rule MUST first have a failing conformance test, then an impleme...](app-07.md)

[^app-06]: sources/EXPERT-REVIEW-PACKAGE.md

