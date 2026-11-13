---
type: "Rule"
title: "CONF-02 — Every implemented interface has a driver."
description: "Every implemented interface has a driver."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-02"
    title: "CONF-02"
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
x-rule-id: "CONF-02"
x-source-part: "Part III.12"
x-source-span: "108-108"
x-verification: "V3 test."
---
# CONF-02

Every implemented interface has a driver.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[4. Matrix](../../sources/40-conformance/4-matrix.md)

[^conf-02]: sources/40-CONFORMANCE.md

