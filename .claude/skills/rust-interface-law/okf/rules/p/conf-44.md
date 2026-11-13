---
type: "Rule"
title: "CONF-44 — An internal access token is rejected as an external ID token."
description: "An internal access token is rejected as an external ID token."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-44"
    title: "CONF-44"
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
x-rule-id: "CONF-44"
x-source-part: "Part III.12"
x-source-span: "260-260"
x-verification: "V3 test."
---
# CONF-44

An internal access token is rejected as an external ID token.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14. SSO Regression](../../sources/40-conformance/14-sso-regression.md)

[^conf-44]: sources/40-CONFORMANCE.md

