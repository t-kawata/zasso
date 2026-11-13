---
type: "Rule"
title: "MCP-27 — MCP authorization MUST expose discovery and challenge, bind the configured audience, and MUST NOT pass a received token downstream."
description: "MCP authorization MUST expose discovery and challenge, bind the configured audience, and MUST NOT pass a received token downstream."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-27"
    title: "MCP-27"
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
x-rule-id: "MCP-27"
x-source-part: "Part III.10"
x-source-span: "210-210"
x-verification: "V3 auth test."
---
# MCP-27

MCP authorization MUST expose discovery and challenge, bind the configured audience, and MUST NOT pass a received token downstream.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 auth test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/34-mcp/11-implementation-contract.md)

[^mcp-27]: sources/34-MCP.md

