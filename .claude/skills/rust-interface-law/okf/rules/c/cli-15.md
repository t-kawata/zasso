---
type: "Rule"
title: "CLI-15 — clap parsing types MUST be generated inside the CLI adapter and MUST NOT annotate operation-domain types."
description: "clap parsing types MUST be generated inside the CLI adapter and MUST NOT annotate operation-domain types."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-15"
    title: "CLI-15"
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
x-rule-id: "CLI-15"
x-source-part: "Part III.8"
x-source-span: "276-276"
x-verification: "V2 AST; V3 command test."
---
# CLI-15

clap parsing types MUST be generated inside the CLI adapter and MUST NOT annotate operation-domain types.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V2 AST; V3 command test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/32-cli/11-implementation-contract.md)

[^cli-15]: sources/32-CLI.md

