---
type: "Rule"
title: "CONF-39 — A missing verification is a failure, not a skip."
description: "A missing verification is a failure, not a skip."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-39"
    title: "CONF-39"
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
x-rule-id: "CONF-39"
x-source-part: "Part III.12"
x-source-span: "248-248"
x-verification: "V3 test."
---
# CONF-39

A missing verification is a failure, not a skip.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[13. Dependency and Rule Coverage](../../sources/40-conformance/13-dependency-and-rule-coverage.md)

[^conf-39]: sources/40-CONFORMANCE.md

