---
type: "Rule"
title: "CONF-59 — Every custom rule has `id`, `check`, `fields`, `description`, and `code`, and appears in every applicable interface reference."
description: "Every custom rule has `id`, `check`, `fields`, `description`, and `code`, and appears in every applicable interface reference."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-59"
    title: "CONF-59"
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
x-rule-id: "CONF-59"
x-source-part: "Part III.12"
x-source-span: "284-284"
x-verification: "V3 test."
---
# CONF-59

Every custom rule has `id`, `check`, `fields`, `description`, and `code`, and appears in every applicable interface reference.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-59]: sources/40-CONFORMANCE.md

