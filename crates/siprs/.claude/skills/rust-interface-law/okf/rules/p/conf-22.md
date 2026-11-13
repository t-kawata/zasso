---
type: "Rule"
title: "CONF-22 — A compile-fail test is not treated as a general proof of non-bypass."
description: "A compile-fail test is not treated as a general proof of non-bypass."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-22"
    title: "CONF-22"
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
x-rule-id: "CONF-22"
x-source-part: "Part III.12"
x-source-span: "185-185"
x-verification: "V4 review."
---
# CONF-22

A compile-fail test is not treated as a general proof of non-bypass.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V4 review. |
| Enforcement | cargo test -p <project>-conformance |

[9. Security Proofs](../../sources/40-conformance/9-security-proofs.md)

[^conf-22]: sources/40-CONFORMANCE.md

