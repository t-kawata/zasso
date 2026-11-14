---
type: "Rule"
title: "MCP-16 — Business state is read and written only through operations."
description: "Business state is read and written only through operations."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-16"
    title: "MCP-16"
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
x-rule-id: "MCP-16"
x-source-part: "Part III.10"
x-source-span: "147-147"
x-verification: "V2 scan; V3 test."
---
# MCP-16

Business state is read and written only through operations.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V2 scan; V3 test. |
| Enforcement | conformance driver |

[8. Session and State](../../sources/part-iii-10/8-session-and-state.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [MCP-15 — MCP session state lives in the adapter, not in business tables.](mcp-15.md)
- [MCP-17 — Resource and prompt surfaces that expose business data MUST read through a qu...](mcp-17.md)
- [MCP-18 — Protocol errors and business execution errors are mapped separately; a protoc...](mcp-18.md)
- [MCP-19 — `McpConfig` records the adopted protocol version, transport profile, and capa...](mcp-19.md)
- [MCP-20 — The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions)...](mcp-20.md)
- [MCP-21 — Every tool result carries the operation's `request_id` in a machine-readable ...](mcp-21.md)

[^mcp-16]: sources/EXPERT-REVIEW-PACKAGE.md

