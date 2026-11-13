---
type: "Rule"
title: "CLI-01 — Argument types are generated separately from operation types. Clap attributes never appear on operation structs."
description: "Argument types are generated separately from operation types. Clap attributes never appear on operation structs."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-01"
    title: "CLI-01"
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
x-rule-class: "G"
x-rule-id: "CLI-01"
x-source-part: "Part III.8"
x-source-span: "115-115"
x-verification: "V1; V2 derive scan."
---
# CLI-01

Argument types are generated separately from operation types. Clap attributes never appear on operation structs.

| Field | Value |
|---|---|
| Class | G |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V1; V2 derive scan. |
| Enforcement | conformance driver |

[5. Generated Command Tree](../../sources/32-cli/5-generated-command-tree.md)

[^cli-01]: sources/32-CLI.md

