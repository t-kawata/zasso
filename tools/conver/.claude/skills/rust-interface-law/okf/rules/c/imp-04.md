---
type: "Rule"
title: "IMP-04 — Core and operation-contract crates MUST NOT depend on protocol SDKs or generated transport types."
description: "Core and operation-contract crates MUST NOT depend on protocol SDKs or generated transport types."
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "imp-04"
    title: "IMP-04"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "implementation-check"
x-parent: "IMP"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "IMP-04"
x-source-part: "Part III.17"
x-source-span: "112-112"
x-verification: "V2 graph check."
---
# IMP-04

Core and operation-contract crates MUST NOT depend on protocol SDKs or generated transport types.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 graph check. |
| Enforcement | implementation-check |

[7. Cross-Cutting Rules](../../sources/55-implementation-contracts/7-cross-cutting-rules.md)

[^imp-04]: sources/55-IMPLEMENTATION-CONTRACTS.md

