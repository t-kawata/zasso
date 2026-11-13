---
type: "Rule"
title: "IMP-07 — Scaffold MUST NOT overwrite an existing file; an existing file without a marker becomes merge-required."
description: "Scaffold MUST NOT overwrite an existing file; an existing file without a marker becomes merge-required."
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "imp-07"
    title: "IMP-07"
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
x-rule-id: "IMP-07"
x-source-part: "Part III.17"
x-source-span: "115-115"
x-verification: "V2 scaffold fixture."
---
# IMP-07

Scaffold MUST NOT overwrite an existing file; an existing file without a marker becomes merge-required.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 scaffold fixture. |
| Enforcement | implementation-check |

[7. Cross-Cutting Rules](../../sources/55-implementation-contracts/7-cross-cutting-rules.md)

[^imp-07]: sources/55-IMPLEMENTATION-CONTRACTS.md

