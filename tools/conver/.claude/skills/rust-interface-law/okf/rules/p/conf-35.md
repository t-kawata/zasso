---
type: "Rule"
title: "CONF-35 — TLS, real upgrade, and CLI process boundaries are covered out-of-process."
description: "TLS, real upgrade, and CLI process boundaries are covered out-of-process."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-35"
    title: "CONF-35"
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
x-rule-id: "CONF-35"
x-source-part: "Part III.12"
x-source-span: "237-237"
x-verification: "V3 test."
---
# CONF-35

TLS, real upgrade, and CLI process boundaries are covered out-of-process.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[12. Drivers](../../sources/40-conformance/12-drivers.md)

[^conf-35]: sources/40-CONFORMANCE.md

