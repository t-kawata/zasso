---
type: "Rule"
title: "MCP-15 — MCP session state lives in the adapter, not in business tables."
description: "MCP session state lives in the adapter, not in business tables."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-15"
    title: "MCP-15"
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
x-rule-id: "MCP-15"
x-source-part: "Part III.10"
x-source-span: "146-146"
x-verification: "V2 schema review."
---
# MCP-15

MCP session state lives in the adapter, not in business tables.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V2 schema review. |
| Enforcement | conformance driver |

[8. Session and State](../../sources/34-mcp/8-session-and-state.md)

[^mcp-15]: sources/34-MCP.md

