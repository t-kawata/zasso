---
type: "Rule"
title: "CONF-49 — REST merges body context and header context, rejects conflicts, and returns `request_id` on success and on every failure path."
description: "REST merges body context and header context, rejects conflicts, and returns `request_id` on success and on every failure path."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-49"
    title: "CONF-49"
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
x-rule-id: "CONF-49"
x-source-part: "Part III.12"
x-source-span: "274-274"
x-verification: "V3 test."
---
# CONF-49

REST merges body context and header context, rejects conflicts, and returns `request_id` on success and on every failure path.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-49]: sources/40-CONFORMANCE.md

