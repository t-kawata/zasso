---
type: "Rule"
title: "CORE-06 — Randomness and ID allocation go through `IdGenerator`."
description: "Randomness and ID allocation go through `IdGenerator`."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-06"
    title: "CORE-06"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "CORE"
x-phase: "core"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "CORE-06"
x-source-part: "Part III.3"
x-source-span: "102-102"
x-verification: "V2 scan; V3 test."
---
# CORE-06

Randomness and ID allocation go through `IdGenerator`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/20-core/5-domain-model-rules.md)

[^core-06]: sources/20-CORE.md

