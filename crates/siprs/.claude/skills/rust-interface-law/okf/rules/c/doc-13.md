---
type: "Rule"
title: "DOC-13 — Documentation and examples MUST NOT contain secrets, tokens, or passwords."
description: "Documentation and examples MUST NOT contain secrets, tokens, or passwords."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-13"
    title: "DOC-13"
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
x-rule-id: "DOC-13"
x-source-part: "Part III.16"
x-source-span: "186-186"
x-verification: "V2 scan; V3 test."
---
# DOC-13

Documentation and examples MUST NOT contain secrets, tokens, or passwords.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-13]: sources/45-DOCUMENTATION.md

