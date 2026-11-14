---
type: "Rule"
title: "CLI-03 — A composition command is allowed only when documented and mapped to a sequence of operations."
description: "A composition command is allowed only when documented and mapped to a sequence of operations."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-03"
    title: "CLI-03"
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
x-rule-id: "CLI-03"
x-source-part: "Part III.8"
x-source-span: "117-117"
x-verification: "V3 test."
---
# CLI-03

A composition command is allowed only when documented and mapped to a sequence of operations.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[5. Generated Command Tree](../../sources/part-iii-8/5-generated-command-tree.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [CLI-01 — Argument types are generated separately from operation types. Clap attributes...](../g/cli-01.md)
- [CLI-02 — Every catalog operation has one subcommand.](cli-02.md)
- [CLI-04 — The command converts arguments into the operation request and calls the dispa...](cli-04.md)

[^cli-03]: sources/EXPERT-REVIEW-PACKAGE.md

