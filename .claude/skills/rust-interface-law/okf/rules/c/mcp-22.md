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
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
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

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [MCP-23 — Every MCP deployment MUST declare its session and replay capabilities and MUS...](mcp-23.md)
- [MCP-24 — MCP JSON and SSE responses MUST use SDK framing and MUST share the same tool ...](mcp-24.md)
- [MCP-25 — Resumable MCP profiles MUST persist event cursors and MUST pass restart repla...](mcp-25.md)
- [MCP-26 — MCP cancellation and progress MUST map to the dispatcher and MUST NOT buffer ...](mcp-26.md)
- [MCP-27 — MCP authorization MUST expose discovery and challenge, bind the configured au...](mcp-27.md)

[^mcp-22]: sources/34-MCP.md

