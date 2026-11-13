---
type: "Rule"
title: "DOC-01 — Every implemented interface MUST have generated usage documentation."
description: "Every implemented interface MUST have generated usage documentation."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-01"
    title: "DOC-01"
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
x-rule-id: "DOC-01"
x-source-part: "Part III.16"
x-source-span: "174-174"
x-verification: "V2 artifact check; V3 test."
---
# DOC-01

Every implemented interface MUST have generated usage documentation.

| Field | Value |
|---|---|
| Class | G |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V2 artifact check; V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-01]: sources/45-DOCUMENTATION.md

