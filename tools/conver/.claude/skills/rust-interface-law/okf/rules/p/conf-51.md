---
type: "Rule"
title: "CONF-51 — Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient."
description: "Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-51"
    title: "CONF-51"
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
x-rule-id: "CONF-51"
x-source-part: "Part III.12"
x-source-span: "276-276"
x-verification: "V3 test."
---
# CONF-51

Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[14.1 Revision Tests (0.3.0)](../../sources/40-conformance/14-1-revision-tests-0-3-0.md)

[^conf-51]: sources/40-CONFORMANCE.md

