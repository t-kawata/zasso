---
type: "Rule"
title: "CORE-05 — Time is injected through `Clock`; `Utc::now()` is forbidden in core."
description: "Time is injected through `Clock`; `Utc::now()` is forbidden in core."
sources: 
  - resource: "sources/20-CORE.md"
    id: "core-05"
    title: "CORE-05"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "cargo test -p <project>-operation/core"
x-parent: "CORE"
x-phase: "core"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "CORE-05"
x-source-part: "Part III.3"
x-source-span: "101-101"
x-verification: "V2 scan; V3 test."
---
# CORE-05

Time is injected through `Clock`; `Utc::now()` is forbidden in core.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | CORE |
| Source part | Part III.3 |
| Verification | V2 scan; V3 test. |
| Enforcement | cargo test -p <project>-operation/core |

[5. Domain Model Rules](../../sources/part-iii-3/5-domain-model-rules.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [CORE-01 — Every aggregate with a lifecycle has one root type and one state enum. Value ...](core-01.md)
- [CORE-02 — Illegal states are unrepresentable. A state transition returns `Result<NextSt...](core-02.md)
- [CORE-03 — Value objects validate on construction.](core-03.md)
- [CORE-04 — IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID acr...](core-04.md)
- [CORE-06 — Randomness and ID allocation go through `IdGenerator`.](core-06.md)
- [CORE-07 — Domain errors are typed and carry a stable code.](core-07.md)
- [CORE-08 — Core does not perform I/O.](core-08.md)
- [CORE-09 — Core does not serialize wire envelopes or know protocol status codes.](core-09.md)
- [CORE-10 — Domain events are values; publication happens outside core.](core-10.md)

[^core-05]: sources/EXPERT-REVIEW-PACKAGE.md

