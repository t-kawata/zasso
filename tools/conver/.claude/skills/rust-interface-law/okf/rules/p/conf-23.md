---
type: "Rule"
title: "CONF-23 — Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not."
description: "Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-23"
    title: "CONF-23"
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
x-rule-id: "CONF-23"
x-source-part: "Part III.12"
x-source-span: "186-186"
x-verification: "V3 test."
---
# CONF-23

Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[9. Security Proofs](../../sources/40-conformance/9-security-proofs.md)

[^conf-23]: sources/40-CONFORMANCE.md

