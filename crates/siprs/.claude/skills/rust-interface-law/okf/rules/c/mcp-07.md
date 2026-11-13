---
type: "Rule"
title: "MCP-07 — Authorization server metadata is exposed at the configured discovery endpoint."
description: "Authorization server metadata is exposed at the configured discovery endpoint."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-07"
    title: "MCP-07"
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
x-rule-id: "MCP-07"
x-source-part: "Part III.10"
x-source-span: "108-108"
x-verification: "V3 protocol test."
---
# MCP-07

Authorization server metadata is exposed at the configured discovery endpoint.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 protocol test. |
| Enforcement | conformance driver |

[6. Authorization](../../sources/34-mcp/6-authorization.md)

[^mcp-07]: sources/34-MCP.md

