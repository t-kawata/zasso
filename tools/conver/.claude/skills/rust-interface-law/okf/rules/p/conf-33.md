---
type: "Rule"
title: "CONF-33 — Backpressure is observable and bounded."
description: "Backpressure is observable and bounded."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-33"
    title: "CONF-33"
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
x-rule-id: "CONF-33"
x-source-part: "Part III.12"
x-source-span: "210-210"
x-verification: "V3 load test."
---
# CONF-33

Backpressure is observable and bounded.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 load test. |
| Enforcement | cargo test -p <project>-conformance |

[11. Streaming](../../sources/40-conformance/11-streaming.md)

[^conf-33]: sources/40-CONFORMANCE.md

