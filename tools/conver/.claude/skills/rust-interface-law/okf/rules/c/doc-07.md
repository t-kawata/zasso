---
type: "Rule"
title: "DOC-07 — Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID."
description: "Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-07"
    title: "DOC-07"
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
x-rule-id: "DOC-07"
x-source-part: "Part III.16"
x-source-span: "180-180"
x-verification: "V3 completeness test."
---
# DOC-07

Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 completeness test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-07]: sources/45-DOCUMENTATION.md

