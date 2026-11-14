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
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
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

[11. Streaming](../../sources/part-iii-12/11-streaming.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-30 — Server stream items, EOF, error, and cancel match the operation contract.](conf-30.md)
- [CONF-31 — Client stream input, EOF, and cancel match the contract.](conf-31.md)
- [CONF-32 — Bidi streams preserve independent half-close and cancellation.](conf-32.md)
- [CONF-33 — Backpressure is observable and bounded.](conf-33.md)

[^conf-34]: sources/EXPERT-REVIEW-PACKAGE.md

