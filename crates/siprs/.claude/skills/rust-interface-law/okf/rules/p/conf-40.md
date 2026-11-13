---
type: "Rule"
title: "CONF-40 — Documentation, file existence, and fixture names are not proof."
description: "Documentation, file existence, and fixture names are not proof."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-40"
    title: "CONF-40"
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
x-rule-id: "CONF-40"
x-source-part: "Part III.12"
x-source-span: "249-249"
x-verification: "V3 report inspection; V4 review."
---
# CONF-40

Documentation, file existence, and fixture names are not proof.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 report inspection; V4 review. |
| Enforcement | cargo test -p <project>-conformance |

[13. Dependency and Rule Coverage](../../sources/40-conformance/13-dependency-and-rule-coverage.md)

[^conf-40]: sources/40-CONFORMANCE.md

