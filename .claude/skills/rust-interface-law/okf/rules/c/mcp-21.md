---
type: "Rule"
title: "MCP-21 — Every tool result carries the operation's `request_id` in a machine-readable field."
description: "Every tool result carries the operation's `request_id` in a machine-readable field."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-21"
    title: "MCP-21"
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
x-rule-id: "MCP-21"
x-source-part: "Part III.10"
x-source-span: "152-152"
x-verification: "V3 test."
---
# MCP-21

Every tool result carries the operation's `request_id` in a machine-readable field.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[8. Session and State](../../sources/34-mcp/8-session-and-state.md)

[^mcp-21]: sources/34-MCP.md

