---
type: "Rule"
title: "DOC-09 — OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references."
description: "OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-09"
    title: "DOC-09"
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
x-rule-id: "DOC-09"
x-source-part: "Part III.16"
x-source-span: "182-182"
x-verification: "V3 diff test."
---
# DOC-09

OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references.

| Field | Value |
|---|---|
| Class | G |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 diff test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-09]: sources/45-DOCUMENTATION.md

