---
type: "Rule"
title: "CLI-17 — The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path."
description: "The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path."
sources: 
  - resource: "sources/32-CLI.md"
    id: "cli-17"
    title: "CLI-17"
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
x-rule-id: "CLI-17"
x-source-part: "Part III.8"
x-source-span: "278-278"
x-verification: "V3 subprocess test."
---
# CLI-17

The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path.

| Field | Value |
|---|---|
| Class | C |
| Applies to | cli |
| Parent | CLI |
| Source part | Part III.8 |
| Verification | V3 subprocess test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/32-cli/11-implementation-contract.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [CLI-15 — clap parsing types MUST be generated inside the CLI adapter and MUST NOT anno...](cli-15.md)
- [CLI-16 — The CLI MUST reject argv credential contents and MUST read secrets only from ...](cli-16.md)

[^cli-17]: sources/32-CLI.md

