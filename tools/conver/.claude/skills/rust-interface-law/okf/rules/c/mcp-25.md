---
type: "Rule"
title: "MCP-25 — Resumable MCP profiles MUST persist event cursors and MUST pass restart replay without sticky routing."
description: "Resumable MCP profiles MUST persist event cursors and MUST pass restart replay without sticky routing."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-25"
    title: "MCP-25"
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
x-rule-id: "MCP-25"
x-source-part: "Part III.10"
x-source-span: "208-208"
x-verification: "V3 restart test."
---
# MCP-25

Resumable MCP profiles MUST persist event cursors and MUST pass restart replay without sticky routing.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 restart test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/34-mcp/11-implementation-contract.md)

[^mcp-25]: sources/34-MCP.md

