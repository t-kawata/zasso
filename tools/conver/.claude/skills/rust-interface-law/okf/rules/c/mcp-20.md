---
type: "Rule"
title: "MCP-20 — The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources."
description: "The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-20"
    title: "MCP-20"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "mcp"
x-enforcement: "conformance driver"
x-parent: "MCP"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "MCP-20"
x-source-part: "Part III.10"
x-source-span: "151-151"
x-verification: "V3 bypass test."
---
# MCP-20

The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 bypass test. |
| Enforcement | conformance driver |

[8. Session and State](../../sources/34-mcp/8-session-and-state.md)

[^mcp-20]: sources/34-MCP.md

