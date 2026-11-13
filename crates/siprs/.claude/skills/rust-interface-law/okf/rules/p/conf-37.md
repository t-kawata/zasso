---
type: "Rule"
title: "CONF-37 — The crate graph passes the forbidden-edge checks."
description: "The crate graph passes the forbidden-edge checks."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-37"
    title: "CONF-37"
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
x-rule-id: "CONF-37"
x-source-part: "Part III.12"
x-source-span: "246-246"
x-verification: "V2 `cargo metadata`."
---
# CONF-37

The crate graph passes the forbidden-edge checks.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V2 `cargo metadata`. |
| Enforcement | cargo test -p <project>-conformance |

[13. Dependency and Rule Coverage](../../sources/40-conformance/13-dependency-and-rule-coverage.md)

[^conf-37]: sources/40-CONFORMANCE.md

