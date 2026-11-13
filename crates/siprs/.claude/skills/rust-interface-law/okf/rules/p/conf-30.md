---
type: "Rule"
title: "CONF-30 — Server stream items, EOF, error, and cancel match the operation contract."
description: "Server stream items, EOF, error, and cancel match the operation contract."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-30"
    title: "CONF-30"
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
x-rule-id: "CONF-30"
x-source-part: "Part III.12"
x-source-span: "207-207"
x-verification: "V3 test."
---
# CONF-30

Server stream items, EOF, error, and cancel match the operation contract.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[11. Streaming](../../sources/40-conformance/11-streaming.md)

[^conf-30]: sources/40-CONFORMANCE.md

