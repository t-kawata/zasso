---
type: "Rule"
title: "CONF-56 — A project without the REST profile still generates documentation for its implemented interfaces."
description: "A project without the REST profile still generates documentation for its implemented interfaces."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-56"
    title: "CONF-56"
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
x-rule-id: "CONF-56"
x-source-part: "Part III.12"
x-source-span: "281-281"
x-verification: "V3 test."
---
# CONF-56

A project without the REST profile still generates documentation for its implemented interfaces.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-56]: sources/40-CONFORMANCE.md

