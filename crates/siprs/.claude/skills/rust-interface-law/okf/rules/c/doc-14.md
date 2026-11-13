---
type: "Rule"
title: "DOC-14 — Documentation MUST record `spec_version` and the input digest."
description: "Documentation MUST record `spec_version` and the input digest."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-14"
    title: "DOC-14"
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
x-rule-id: "DOC-14"
x-source-part: "Part III.16"
x-source-span: "187-187"
x-verification: "V3 test."
---
# DOC-14

Documentation MUST record `spec_version` and the input digest.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-14]: sources/45-DOCUMENTATION.md

