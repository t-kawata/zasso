---
type: "Rule"
title: "CONF-31 — Client stream input, EOF, and cancel match the contract."
description: "Client stream input, EOF, and cancel match the contract."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-31"
    title: "CONF-31"
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
x-rule-id: "CONF-31"
x-source-part: "Part III.12"
x-source-span: "208-208"
x-verification: "V3 test."
---
# CONF-31

Client stream input, EOF, and cancel match the contract.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[11. Streaming](../../sources/40-conformance/11-streaming.md)

[^conf-31]: sources/40-CONFORMANCE.md

