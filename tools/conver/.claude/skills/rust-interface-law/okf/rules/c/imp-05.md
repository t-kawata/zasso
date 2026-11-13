---
type: "Rule"
title: "IMP-05 — Required source calls MUST be resolved by identity, and unresolved analysis MUST fail closed."
description: "Required source calls MUST be resolved by identity, and unresolved analysis MUST fail closed."
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "imp-05"
    title: "IMP-05"
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
x-rule-id: "IMP-05"
x-source-part: "Part III.17"
x-source-span: "113-113"
x-verification: "V2 source detector."
---
# IMP-05

Required source calls MUST be resolved by identity, and unresolved analysis MUST fail closed.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 source detector. |
| Enforcement | implementation-check |

[7. Cross-Cutting Rules](../../sources/55-implementation-contracts/7-cross-cutting-rules.md)

[^imp-05]: sources/55-IMPLEMENTATION-CONTRACTS.md

