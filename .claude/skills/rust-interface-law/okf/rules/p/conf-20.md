---
type: "Rule"
title: "CONF-20 — An adapter cannot construct `VerifiedIdentity`."
description: "An adapter cannot construct `VerifiedIdentity`."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-20"
    title: "CONF-20"
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
x-rule-id: "CONF-20"
x-source-part: "Part III.12"
x-source-span: "183-183"
x-verification: "V1; V3."
---
# CONF-20

An adapter cannot construct `VerifiedIdentity`.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V1; V3. |
| Enforcement | cargo test -p <project>-conformance |

[9. Security Proofs](../../sources/40-conformance/9-security-proofs.md)

[^conf-20]: sources/40-CONFORMANCE.md

