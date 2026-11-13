---
type: "Rule"
title: "CONF-10 — Expected results are derived from the operation specification, not from one interface."
description: "Expected results are derived from the operation specification, not from one interface."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-10"
    title: "CONF-10"
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
x-rule-id: "CONF-10"
x-source-part: "Part III.12"
x-source-span: "159-159"
x-verification: "V3 review of oracle source."
---
# CONF-10

Expected results are derived from the operation specification, not from one interface.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 review of oracle source. |
| Enforcement | cargo test -p <project>-conformance |

[7. Independent Oracle](../../sources/40-conformance/7-independent-oracle.md)

[^conf-10]: sources/40-CONFORMANCE.md

