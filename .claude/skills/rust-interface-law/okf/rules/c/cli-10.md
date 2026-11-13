---
type: "Rule"
title: "CLI-10 — A secret in argv is rejected before any operation."
description: "A secret in argv is rejected before any operation."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-10"
    title: "CLI-10"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "cli"
x-enforcement: "conformance driver"
x-parent: "CLI"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "CLI-10"
x-source-part: "Part III.8"
x-source-span: "221-221"
x-verification: "V3 test."
---
# CLI-10

A secret in argv is rejected before any operation.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[8. Secrets](../../sources/32-cli/8-secrets.md)

[^cli-10]: sources/32-CLI.md

