---
type: "Rule"
title: "CLI-17 — The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path."
description: "The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-17"
    title: "CLI-17"
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
x-rule-id: "CLI-17"
x-source-part: "Part III.8"
x-source-span: "278-278"
x-verification: "V3 subprocess test."
---
# CLI-17

The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V3 subprocess test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/32-cli/11-implementation-contract.md)

[^cli-17]: sources/32-CLI.md

