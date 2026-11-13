---
type: "Rule"
title: "DOC-12 — Generation MUST be deterministic for the same inputs and version."
description: "Generation MUST be deterministic for the same inputs and version."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-12"
    title: "DOC-12"
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
x-rule-id: "DOC-12"
x-source-part: "Part III.16"
x-source-span: "185-185"
x-verification: "V3 digest test."
---
# DOC-12

Generation MUST be deterministic for the same inputs and version.

| Field | Value |
|---|---|
| Class | G |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 digest test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-12]: sources/45-DOCUMENTATION.md

