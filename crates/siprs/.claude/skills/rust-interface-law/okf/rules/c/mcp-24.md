---
type: "Rule"
title: "MCP-24 — MCP JSON and SSE responses MUST use SDK framing and MUST share the same tool execution path."
description: "MCP JSON and SSE responses MUST use SDK framing and MUST share the same tool execution path."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-24"
    title: "MCP-24"
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
x-rule-id: "MCP-24"
x-source-part: "Part III.10"
x-source-span: "207-207"
x-verification: "V3 dual-mode test."
---
# MCP-24

MCP JSON and SSE responses MUST use SDK framing and MUST share the same tool execution path.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 dual-mode test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/34-mcp/11-implementation-contract.md)

[^mcp-24]: sources/34-MCP.md

