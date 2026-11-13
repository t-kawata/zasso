---
type: "Rule"
title: "CONF-13 — Every required interface rejects a token for another audience."
description: "Every required interface rejects a token for another audience."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-13"
    title: "CONF-13"
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
x-rule-id: "CONF-13"
x-source-part: "Part III.12"
x-source-span: "169-169"
x-verification: "V3 test."
---
# CONF-13

Every required interface rejects a token for another audience.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[8. Authentication and Binding](../../sources/40-conformance/8-authentication-and-binding.md)

[^conf-13]: sources/40-CONFORMANCE.md

