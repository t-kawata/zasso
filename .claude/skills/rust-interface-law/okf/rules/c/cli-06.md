---
type: "Rule"
title: "CLI-06 — `--json` emits one JSON value; `--jsonl` emits one JSON object per line."
description: "`--json` emits one JSON value; `--jsonl` emits one JSON object per line."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-06"
    title: "CLI-06"
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
x-rule-id: "CLI-06"
x-source-part: "Part III.8"
x-source-span: "194-194"
x-verification: "V3 test."
---
# CLI-06

`--json` emits one JSON value; `--jsonl` emits one JSON object per line.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[7. Output and Exit Codes](../../sources/32-cli/7-output-and-exit-codes.md)

[^cli-06]: sources/32-CLI.md

