---
type: "Rule"
title: "CONF-41 — The report names every failed row and every rule without evidence."
description: "The report names every failed row and every rule without evidence."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-41"
    title: "CONF-41"
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
x-rule-id: "CONF-41"
x-source-part: "Part III.12"
x-source-span: "250-250"
x-verification: "V3 test."
---
# CONF-41

The report names every failed row and every rule without evidence.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[13. Dependency and Rule Coverage](../../sources/40-conformance/13-dependency-and-rule-coverage.md)

[^conf-41]: sources/40-CONFORMANCE.md

