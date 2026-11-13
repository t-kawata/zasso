---
type: "Rule"
title: "CONF-36 — A driver that cannot exercise a required boundary reports `Fail`, not `NotApplicable`."
description: "A driver that cannot exercise a required boundary reports `Fail`, not `NotApplicable`."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-36"
    title: "CONF-36"
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
x-rule-id: "CONF-36"
x-source-part: "Part III.12"
x-source-span: "238-238"
x-verification: "V3 test."
---
# CONF-36

A driver that cannot exercise a required boundary reports `Fail`, not `NotApplicable`.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[12. Drivers](../../sources/40-conformance/12-drivers.md)

[^conf-36]: sources/40-CONFORMANCE.md

