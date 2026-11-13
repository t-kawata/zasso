---
type: "Rule"
title: "CONF-42 — After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged."
description: "After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-42"
    title: "CONF-42"
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
x-rule-id: "CONF-42"
x-source-part: "Part III.12"
x-source-span: "258-258"
x-verification: "V3 regression test."
---
# CONF-42

After SSO is added, existing operation signatures, subject IDs, and business data references are unchanged.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 regression test. |
| Enforcement | cargo test -p <project>-conformance |

[14. SSO Regression](../../sources/40-conformance/14-sso-regression.md)

[^conf-42]: sources/40-CONFORMANCE.md

