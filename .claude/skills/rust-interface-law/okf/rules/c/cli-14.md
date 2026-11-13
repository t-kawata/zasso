---
type: "Rule"
title: "CLI-14 — The remote client is a protocol client, not an interface-adapter dependency."
description: "The remote client is a protocol client, not an interface-adapter dependency."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-14"
    title: "CLI-14"
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
x-rule-id: "CLI-14"
x-source-part: "Part III.8"
x-source-span: "198-198"
x-verification: "V2 dependency check."
---
# CLI-14

The remote client is a protocol client, not an interface-adapter dependency.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V2 dependency check. |
| Enforcement | conformance driver |

[7. Output and Exit Codes](../../sources/32-cli/7-output-and-exit-codes.md)

[^cli-14]: sources/32-CLI.md

