---
type: "Rule"
title: "CONF-15 — An expired binding is rejected even when the signature is valid."
description: "An expired binding is rejected even when the signature is valid."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-15"
    title: "CONF-15"
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
x-rule-id: "CONF-15"
x-source-part: "Part III.12"
x-source-span: "171-171"
x-verification: "V3 test."
---
# CONF-15

An expired binding is rejected even when the signature is valid.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[8. Authentication and Binding](../../sources/40-conformance/8-authentication-and-binding.md)

[^conf-15]: sources/40-CONFORMANCE.md

