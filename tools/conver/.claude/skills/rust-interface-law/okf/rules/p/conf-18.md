---
type: "Rule"
title: "CONF-18 — Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation."
description: "Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-18"
    title: "CONF-18"
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
x-rule-id: "CONF-18"
x-source-part: "Part III.12"
x-source-span: "174-174"
x-verification: "V3 test."
---
# CONF-18

Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[8. Authentication and Binding](../../sources/40-conformance/8-authentication-and-binding.md)

[^conf-18]: sources/40-CONFORMANCE.md

