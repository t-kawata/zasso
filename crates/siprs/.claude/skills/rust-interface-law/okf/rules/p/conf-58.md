---
type: "Rule"
title: "CONF-58 — Standard constraints map to schema keywords; byte-length and non-ECMA regex rules are custom and not mis-mapped."
description: "Standard constraints map to schema keywords; byte-length and non-ECMA regex rules are custom and not mis-mapped."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-58"
    title: "CONF-58"
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
x-rule-id: "CONF-58"
x-source-part: "Part III.12"
x-source-span: "283-283"
x-verification: "V3 test."
---
# CONF-58

Standard constraints map to schema keywords; byte-length and non-ECMA regex rules are custom and not mis-mapped.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-58]: sources/40-CONFORMANCE.md

