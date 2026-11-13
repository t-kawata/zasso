---
type: "Rule"
title: "MCP-26 — MCP cancellation and progress MUST map to the dispatcher and MUST NOT buffer unsupported operations."
description: "MCP cancellation and progress MUST map to the dispatcher and MUST NOT buffer unsupported operations."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-26"
    title: "MCP-26"
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
x-rule-id: "MCP-26"
x-source-part: "Part III.10"
x-source-span: "209-209"
x-verification: "V3 cancel/progress test."
---
# MCP-26

MCP cancellation and progress MUST map to the dispatcher and MUST NOT buffer unsupported operations.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 cancel/progress test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/34-mcp/11-implementation-contract.md)

[^mcp-26]: sources/34-MCP.md

