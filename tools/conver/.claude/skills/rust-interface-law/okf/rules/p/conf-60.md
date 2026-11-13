---
type: "Rule"
title: "CONF-60 — Unknown or type-incompatible rules fail compilation; no rule is silently omitted."
description: "Unknown or type-incompatible rules fail compilation; no rule is silently omitted."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-60"
    title: "CONF-60"
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
x-rule-id: "CONF-60"
x-source-part: "Part III.12"
x-source-span: "285-285"
x-verification: "V3 compile-fail test."
---
# CONF-60

Unknown or type-incompatible rules fail compilation; no rule is silently omitted.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 compile-fail test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-60]: sources/40-CONFORMANCE.md

