---
type: "Rule"
title: "IMP-08 — Template bodies MUST NOT be delivered by context; only rule text, contract tables, and template references are delivered."
description: "Template bodies MUST NOT be delivered by context; only rule text, contract tables, and template references are delivered."
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "imp-08"
    title: "IMP-08"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "implementation-check"
x-parent: "IMP"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "IMP-08"
x-source-part: "Part III.17"
x-source-span: "1482-1482"
x-verification: "V2 delivery test."
---
# IMP-08

Template bodies MUST NOT be delivered by context; only rule text, contract tables, and template references are delivered.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 delivery test. |
| Enforcement | implementation-check |

[11. Adapter Support Composition](../../sources/10-contracts/11-adapter-support-composition.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [IMP-01 — Dependency declarations MUST use the admitted crate, exact version, features,...](imp-01.md)

[^imp-08]: sources/10-CONTRACTS.md

