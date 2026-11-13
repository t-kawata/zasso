---
type: "Rule"
title: "CONF-04 — A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell."
description: "A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-04"
    title: "CONF-04"
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
x-rule-id: "CONF-04"
x-source-part: "Part III.12"
x-source-span: "110-110"
x-verification: "V3 test."
---
# CONF-04

A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[4. Matrix](../../sources/40-conformance/4-matrix.md)

[^conf-04]: sources/40-CONFORMANCE.md

