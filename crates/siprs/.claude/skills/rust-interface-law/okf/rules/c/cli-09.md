---
type: "Rule"
title: "CLI-09 — Secrets are read from a file, stdin, or TTY."
description: "Secrets are read from a file, stdin, or TTY."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-09"
    title: "CLI-09"
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
x-rule-id: "CLI-09"
x-source-part: "Part III.8"
x-source-span: "220-220"
x-verification: "V2 argv scan; V3 test."
---
# CLI-09

Secrets are read from a file, stdin, or TTY.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V2 argv scan; V3 test. |
| Enforcement | conformance driver |

[8. Secrets](../../sources/32-cli/8-secrets.md)

[^cli-09]: sources/32-CLI.md

