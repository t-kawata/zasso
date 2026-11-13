---
type: "Rule"
title: "CONF-21 — The trusted constructor is not reachable from adapter crates; allowed call sites are audited."
description: "The trusted constructor is not reachable from adapter crates; allowed call sites are audited."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-21"
    title: "CONF-21"
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
x-rule-id: "CONF-21"
x-source-part: "Part III.12"
x-source-span: "184-184"
x-verification: "V2 scan; V4 review."
---
# CONF-21

The trusted constructor is not reachable from adapter crates; allowed call sites are audited.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V2 scan; V4 review. |
| Enforcement | cargo test -p <project>-conformance |

[9. Security Proofs](../../sources/40-conformance/9-security-proofs.md)

[^conf-21]: sources/40-CONFORMANCE.md

