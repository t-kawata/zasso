---
type: "Rule"
title: "DOC-08 — Every implemented interface MUST have a reference section for every applicable operation."
description: "Every implemented interface MUST have a reference section for every applicable operation."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-08"
    title: "DOC-08"
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
x-rule-id: "DOC-08"
x-source-part: "Part III.16"
x-source-span: "181-181"
x-verification: "V3 matrix test."
---
# DOC-08

Every implemented interface MUST have a reference section for every applicable operation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 matrix test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-08]: sources/45-DOCUMENTATION.md

