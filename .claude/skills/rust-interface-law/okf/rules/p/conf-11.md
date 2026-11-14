---
type: "Rule"
title: "CONF-11 — All interfaces answering the same wrong result is a failure."
description: "All interfaces answering the same wrong result is a failure."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-11"
    title: "CONF-11"
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
x-rule-id: "CONF-11"
x-source-part: "Part III.12"
x-source-span: "160-160"
x-verification: "V3 test."
---
# CONF-11

All interfaces answering the same wrong result is a failure.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[7. Independent Oracle](../../sources/part-iii-12/7-independent-oracle.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-10 — Expected results are derived from the operation specification, not from one i...](conf-10.md)
- [CONF-12 — The oracle covers normal, failure, state, authorization, idempotency, and str...](conf-12.md)

[^conf-11]: sources/EXPERT-REVIEW-PACKAGE.md

