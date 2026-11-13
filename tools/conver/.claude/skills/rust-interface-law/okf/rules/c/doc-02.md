---
type: "Rule"
title: "DOC-02 — The operation catalog is the authoritative operation list and binding map."
description: "The operation catalog is the authoritative operation list and binding map."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-02"
    title: "DOC-02"
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
x-rule-id: "DOC-02"
x-source-part: "Part III.16"
x-source-span: "175-175"
x-verification: "V3 catalog test."
---
# DOC-02

The operation catalog is the authoritative operation list and binding map.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V3 catalog test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-02]: sources/45-DOCUMENTATION.md

