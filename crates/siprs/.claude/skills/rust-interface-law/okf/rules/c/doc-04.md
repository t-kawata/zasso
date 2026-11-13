---
type: "Rule"
title: "DOC-04 — `utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces."
description: "`utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-04"
    title: "DOC-04"
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
x-rule-id: "DOC-04"
x-source-part: "Part III.16"
x-source-span: "177-177"
x-verification: "V3 test."
---
# DOC-04

`utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-04]: sources/45-DOCUMENTATION.md

