---
type: "Rule"
title: "DOC-17 — Custom validation rules MUST appear as readable English text in every applicable interface reference."
description: "Custom validation rules MUST appear as readable English text in every applicable interface reference."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-17"
    title: "DOC-17"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "docs"
x-enforcement: "cargo run -p <project>-docgen -- --check all"
x-parent: "DOC"
x-phase: "docs"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "DOC-17"
x-source-part: "Part III.16"
x-source-span: "190-190"
x-verification: "V3 test."
---
# DOC-17

Custom validation rules MUST appear as readable English text in every applicable interface reference.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-17]: sources/45-DOCUMENTATION.md

