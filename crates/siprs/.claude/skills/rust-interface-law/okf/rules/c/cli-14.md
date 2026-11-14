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

[7. Output and Exit Codes](../../sources/part-iii-8/7-output-and-exit-codes.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [CLI-05 — Data goes to stdout; progress and diagnostics go to stderr.](cli-05.md)
- [CLI-06 — `--json` emits one JSON value; `--jsonl` emits one JSON object per line.](cli-06.md)
- [CLI-07 — Human output is not parsed by scripts; JSON is the machine contract.](cli-07.md)
- [CLI-08 — Exit codes follow the fixed table.](cli-08.md)
- [CLI-13 — JSON/JSONL output includes the operation's `request_id`.](cli-13.md)

[^cli-14]: sources/EXPERT-REVIEW-PACKAGE.md

