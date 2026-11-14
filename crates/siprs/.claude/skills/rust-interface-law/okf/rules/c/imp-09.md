---
type: "Rule"
title: "IMP-09 — Missing implementation reports, missing tests, zero selected tests, and failed detectors MUST NOT pass."
description: "Missing implementation reports, missing tests, zero selected tests, and failed detectors MUST NOT pass."
sources: 
  - resource: "sources/55-IMPLEMENTATION-CONTRACTS.md"
    id: "imp-09"
    title: "IMP-09"
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
x-rule-id: "IMP-09"
x-source-part: "Part III.17"
x-source-span: "117-117"
x-verification: "V2 gate self-test."
---
# IMP-09

Missing implementation reports, missing tests, zero selected tests, and failed detectors MUST NOT pass.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | IMP |
| Source part | Part III.17 |
| Verification | V2 gate self-test. |
| Enforcement | implementation-check |

[7. Cross-Cutting Rules](../../sources/55-implementation-contracts/7-cross-cutting-rules.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [IMP-02 — The gate MUST reject every unresolved dependency, feature, source, advisory, ...](imp-02.md)
- [IMP-03 — Adapter dependency edges MUST reach the dispatcher and identity contracts and...](imp-03.md)
- [IMP-04 — Core and operation-contract crates MUST NOT depend on protocol SDKs or genera...](imp-04.md)
- [IMP-05 — Required source calls MUST be resolved by identity, and unresolved analysis M...](imp-05.md)
- [IMP-06 — Generated adapter output MUST equal regeneration from the admitted template a...](imp-06.md)
- [IMP-07 — Scaffold MUST NOT overwrite an existing file; an existing file without a mark...](imp-07.md)
- [IMP-10 — Every project MUST pin the law spec_version, dist hash, and policy hash; a mi...](imp-10.md)
- [IMP-11 — Every implementation rule MUST have a detector or an explicit attestation row.](imp-11.md)

[^imp-09]: sources/55-IMPLEMENTATION-CONTRACTS.md

