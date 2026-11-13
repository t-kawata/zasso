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
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
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

[4. Matrix](../../sources/40-conformance/4-matrix.md)

[^conf-03]: sources/40-CONFORMANCE.md

