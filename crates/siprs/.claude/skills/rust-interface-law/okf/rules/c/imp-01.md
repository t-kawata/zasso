---
type: "Rule"
title: "IMP-01 — Dependency declarations MUST use the admitted crate, exact version, features, and default-features policy."
description: "Dependency declarations MUST use the admitted crate, exact version, features, and default-features policy."
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "imp-01"
    title: "IMP-01"
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
x-rule-id: "IMP-01"
x-source-part: "Part III.17"
x-source-span: "1482-1482"
x-verification: "V2 metadata check."
---
# IMP-01

Dependency declarations MUST use the admitted crate, exact version, features, and default-features policy.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 metadata check. |
| Enforcement | implementation-check |

[11. Adapter Support Composition](../../sources/10-contracts/11-adapter-support-composition.md)

[^imp-01]: sources/10-CONTRACTS.md

