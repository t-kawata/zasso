---
type: "Rule"
title: "CLI-13 — JSON/JSONL output includes the operation's `request_id`."
description: "JSON/JSONL output includes the operation's `request_id`."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-13"
    title: "CLI-13"
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
x-rule-id: "CLI-13"
x-source-part: "Part III.8"
x-source-span: "197-197"
x-verification: "V3 test."
---
# CLI-13

JSON/JSONL output includes the operation's `request_id`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[7. Output and Exit Codes](../../sources/32-cli/7-output-and-exit-codes.md)

[^cli-13]: sources/32-CLI.md

