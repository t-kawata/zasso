---
type: "Rule"
title: "CONF-61 — Every request uses the macro; the validator, descriptor, schema registration, and inventory entries are present."
description: "Every request uses the macro; the validator, descriptor, schema registration, and inventory entries are present."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-61"
    title: "CONF-61"
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
x-rule-id: "CONF-61"
x-source-part: "Part III.12"
x-source-span: "286-286"
x-verification: "V3 test."
---
# CONF-61

Every request uses the macro; the validator, descriptor, schema registration, and inventory entries are present.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-61]: sources/40-CONFORMANCE.md

