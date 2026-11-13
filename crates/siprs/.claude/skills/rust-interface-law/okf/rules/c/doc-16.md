---
type: "Rule"
title: "DOC-16 — Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code."
description: "Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code."
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "doc-16"
    title: "DOC-16"
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
x-rule-id: "DOC-16"
x-source-part: "Part III.16"
x-source-span: "189-189"
x-verification: "V2 scan; V3 test."
---
# DOC-16

Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code.

| Field | Value |
|---|---|
| Class | C |
| Applies to | docs |
| Parent | DOC |
| Source part | Part III.16 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo run -p <project>-docgen -- --check all |

[9. Rules](../../sources/45-documentation/9-rules.md)

[^doc-16]: sources/45-DOCUMENTATION.md

