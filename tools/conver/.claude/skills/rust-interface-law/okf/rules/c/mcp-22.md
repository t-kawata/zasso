---
type: "Rule"
title: "MCP-22 — MCP adapters MUST register generated tools through the admitted rmcp tool router and MUST dispatch through the shared Dispatcher."
description: "MCP adapters MUST register generated tools through the admitted rmcp tool router and MUST dispatch through the shared Dispatcher."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-22"
    title: "MCP-22"
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
x-rule-id: "MCP-22"
x-source-part: "Part III.10"
x-source-span: "205-205"
x-verification: "V2 source; V3 tool test."
---
# MCP-22

MCP adapters MUST register generated tools through the admitted rmcp tool router and MUST dispatch through the shared Dispatcher.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V2 source; V3 tool test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/34-mcp/11-implementation-contract.md)

[^mcp-22]: sources/34-MCP.md

