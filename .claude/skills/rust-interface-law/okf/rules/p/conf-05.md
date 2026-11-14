---
type: "Rule"
title: "CONF-05 — Every case names a fixture with setup and reset."
description: "Every case names a fixture with setup and reset."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-05"
    title: "CONF-05"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "conformance"
x-enforcement: "cargo test -p <project>-conformance"
x-parent: "CONF"
x-phase: "conformance"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "P"
x-rule-id: "CONF-05"
x-source-part: "Part III.12"
x-source-span: "147-147"
x-verification: "V3 test."
---
# CONF-05

Every case names a fixture with setup and reset.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[6. Fixtures and Determinism](../../sources/part-iii-12/6-fixtures-and-determinism.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-06 — IDs and time are deterministic in fixtures.](conf-06.md)
- [CONF-07 — Generated IDs and timestamps use semantic matchers, not exact equality.](conf-07.md)
- [CONF-08 — A case must not depend on the order of another case.](conf-08.md)
- [CONF-09 — A mutation case must assert the resulting state, not only the response.](conf-09.md)

[^conf-05]: sources/EXPERT-REVIEW-PACKAGE.md

