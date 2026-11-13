---
type: "Rule"
title: "CONF-34 — A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient."
description: "A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-34"
    title: "CONF-34"
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
x-rule-id: "CONF-34"
x-source-part: "Part III.12"
x-source-span: "211-211"
x-verification: "V3 test."
---
# CONF-34

A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[11. Streaming](../../sources/40-conformance/11-streaming.md)

[^conf-34]: sources/40-CONFORMANCE.md

