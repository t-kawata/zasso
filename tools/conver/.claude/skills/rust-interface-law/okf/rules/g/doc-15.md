---
type: "Rule"
title: "DOC-15 — Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate."
description: "Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-15"
    title: "DOC-15"
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
x-rule-id: "DOC-15"
x-source-part: "Part III.16"
x-source-span: "188-188"
x-verification: "V3 test."
---
# DOC-15

Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate.

| Field | Value |
|---|---|
| Class | G |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-15]: sources/45-DOCUMENTATION.md

