---
type: "Rule"
title: "IMP-10 — Every project MUST pin the law spec_version, dist hash, and policy hash; a mismatch fails unless a scoped exception exists."
description: "Every project MUST pin the law spec_version, dist hash, and policy hash; a mismatch fails unless a scoped exception exists."
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "imp-10"
    title: "IMP-10"
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
x-rule-id: "IMP-10"
x-source-part: "Part III.17"
x-source-span: "118-118"
x-verification: "V2 identity check."
---
# IMP-10

Every project MUST pin the law spec_version, dist hash, and policy hash; a mismatch fails unless a scoped exception exists.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 identity check. |
| Enforcement | implementation-check |

[7. Cross-Cutting Rules](../../sources/55-implementation-contracts/7-cross-cutting-rules.md)

[^imp-10]: sources/55-IMPLEMENTATION-CONTRACTS.md

