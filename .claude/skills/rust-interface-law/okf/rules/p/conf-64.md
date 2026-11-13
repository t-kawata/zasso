---
type: "Rule"
title: "CONF-64 — No alternate validation/documentation method is used without a versioned exception."
description: "No alternate validation/documentation method is used without a versioned exception."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-64"
    title: "CONF-64"
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
x-rule-id: "CONF-64"
x-source-part: "Part III.12"
x-source-span: "289-289"
x-verification: "V2 config check; V4 review."
---
# CONF-64

No alternate validation/documentation method is used without a versioned exception.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V2 config check; V4 review. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-64]: sources/40-CONFORMANCE.md

