---
type: "Rule"
title: "CLI-11 — Secrets are never written to stdout, logs, or error messages."
description: "Secrets are never written to stdout, logs, or error messages."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-11"
    title: "CLI-11"
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
x-rule-id: "CLI-11"
x-source-part: "Part III.8"
x-source-span: "222-222"
x-verification: "V2 scan; V3 redaction test."
---
# CLI-11

Secrets are never written to stdout, logs, or error messages.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V2 scan; V3 redaction test. |
| Enforcement | conformance driver |

[8. Secrets](../../sources/32-cli/8-secrets.md)

[^cli-11]: sources/32-CLI.md

