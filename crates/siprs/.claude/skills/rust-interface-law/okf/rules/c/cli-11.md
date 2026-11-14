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
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
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

[8. Secrets](../../sources/part-iii-8/8-secrets.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [CLI-09 — Secrets are read from a file, stdin, or TTY.](cli-09.md)
- [CLI-10 — A secret in argv is rejected before any operation.](cli-10.md)
- [CLI-12 — Token files are checked for restrictive permissions.](cli-12.md)

[^cli-11]: sources/EXPERT-REVIEW-PACKAGE.md

