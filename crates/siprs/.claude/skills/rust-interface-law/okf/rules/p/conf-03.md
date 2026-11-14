---
type: "Rule"
title: "CONF-03 — Every cell is required or not applicable with a reason."
description: "Every cell is required or not applicable with a reason."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-03"
    title: "CONF-03"
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
x-rule-id: "CONF-03"
x-source-part: "Part III.12"
x-source-span: "109-109"
x-verification: "V3 test."
---
# CONF-03

Every cell is required or not applicable with a reason.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[4. Matrix](../../sources/part-iii-12/4-matrix.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-01 — Every catalog operation appears in the matrix.](conf-01.md)
- [CONF-02 — Every implemented interface has a driver.](conf-02.md)
- [CONF-04 — A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell.](conf-04.md)

[^conf-03]: sources/EXPERT-REVIEW-PACKAGE.md

