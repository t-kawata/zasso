---
type: "Rule"
title: "DOC-11 — Generated documentation MUST be English-only; a non-English string fails the build."
description: "Generated documentation MUST be English-only; a non-English string fails the build."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-11"
    title: "DOC-11"
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
x-rule-class: "G"
x-rule-id: "DOC-11"
x-source-part: "Part III.16"
x-source-span: "184-184"
x-verification: "V2 scan; V3 test."
---
# DOC-11

Generated documentation MUST be English-only; a non-English string fails the build.

| Field | Value |
|---|---|
| Class | G |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-11]: sources/45-DOCUMENTATION.md

