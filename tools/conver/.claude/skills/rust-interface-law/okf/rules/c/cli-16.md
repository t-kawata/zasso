---
type: "Rule"
title: "CLI-16 — The CLI MUST reject argv credential contents and MUST read secrets only from approved file, stdin, or TTY sources."
description: "The CLI MUST reject argv credential contents and MUST read secrets only from approved file, stdin, or TTY sources."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-16"
    title: "CLI-16"
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
x-rule-id: "CLI-16"
x-source-part: "Part III.8"
x-source-span: "277-277"
x-verification: "V2 scan; V3 process test."
---
# CLI-16

The CLI MUST reject argv credential contents and MUST read secrets only from approved file, stdin, or TTY sources.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V2 scan; V3 process test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/32-cli/11-implementation-contract.md)

[^cli-16]: sources/32-CLI.md

