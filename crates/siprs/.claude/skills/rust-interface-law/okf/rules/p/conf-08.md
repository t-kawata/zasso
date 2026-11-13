---
type: "Rule"
title: "CONF-08 — A case must not depend on the order of another case."
description: "A case must not depend on the order of another case."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-08"
    title: "CONF-08"
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
x-rule-id: "CONF-08"
x-source-part: "Part III.12"
x-source-span: "150-150"
x-verification: "V3 test."
---
# CONF-08

A case must not depend on the order of another case.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[6. Fixtures and Determinism](../../sources/40-conformance/6-fixtures-and-determinism.md)

[^conf-08]: sources/40-CONFORMANCE.md

