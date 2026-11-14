---
type: "Rule"
title: "CLI-01 — Argument types are generated separately from operation types. Clap attributes never appear on operation structs."
description: "Argument types are generated separately from operation types. Clap attributes never appear on operation structs."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-01"
    title: "CLI-01"
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
x-rule-class: "G"
x-rule-id: "CLI-01"
x-source-part: "Part III.8"
x-source-span: "115-115"
x-verification: "V1; V2 derive scan."
---
# CLI-01

Argument types are generated separately from operation types. Clap attributes never appear on operation structs.

| Field | Value |
|---|---|
| Class | G |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V1; V2 derive scan. |
| Enforcement | conformance driver |

[5. Generated Command Tree](../../sources/part-iii-8/5-generated-command-tree.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CLI-02 — Every catalog operation has one subcommand.](../c/cli-02.md)
- [CLI-03 — A composition command is allowed only when documented and mapped to a sequenc...](../c/cli-03.md)
- [CLI-04 — The command converts arguments into the operation request and calls the dispa...](../c/cli-04.md)

[^cli-01]: sources/EXPERT-REVIEW-PACKAGE.md

