---
type: "Rule"
title: "MCP-14 — Error details never contain tokens, secrets, or raw provider responses."
description: "Error details never contain tokens, secrets, or raw provider responses."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-14"
    title: "MCP-14"
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
x-rule-id: "MCP-14"
x-source-part: "Part III.10"
x-source-span: "138-138"
x-verification: "V2 scan; V3 test."
---
# MCP-14

Error details never contain tokens, secrets, or raw provider responses.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V2 scan; V3 test. |
| Enforcement | conformance driver |

[7. Errors](../../sources/34-mcp/7-errors.md)

[^mcp-14]: sources/34-MCP.md

