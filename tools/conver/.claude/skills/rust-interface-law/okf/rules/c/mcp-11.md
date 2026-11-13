---
type: "Rule"
title: "MCP-11 — A received token MUST NOT be passed through to a downstream API."
description: "A received token MUST NOT be passed through to a downstream API."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-11"
    title: "MCP-11"
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
x-rule-id: "MCP-11"
x-source-part: "Part III.10"
x-source-span: "112-112"
x-verification: "V2 scan; V3 test."
---
# MCP-11

A received token MUST NOT be passed through to a downstream API.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V2 scan; V3 test. |
| Enforcement | conformance driver |

[6. Authorization](../../sources/34-mcp/6-authorization.md)

[^mcp-11]: sources/34-MCP.md

