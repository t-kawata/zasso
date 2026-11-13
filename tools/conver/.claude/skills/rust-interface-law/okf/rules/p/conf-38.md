---
type: "Rule"
title: "CONF-38 — Every rule ID in the registry has a verdict."
description: "Every rule ID in the registry has a verdict."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-38"
    title: "CONF-38"
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
x-rule-id: "CONF-38"
x-source-part: "Part III.12"
x-source-span: "247-247"
x-verification: "V3 rule-coverage test."
---
# CONF-38

Every rule ID in the registry has a verdict.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 rule-coverage test. |
| Enforcement | cargo test -p <project>-conformance |

[13. Dependency and Rule Coverage](../../sources/40-conformance/13-dependency-and-rule-coverage.md)

[^conf-38]: sources/40-CONFORMANCE.md

