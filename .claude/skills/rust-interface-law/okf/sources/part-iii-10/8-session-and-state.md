---
type: "Section"
title: "8. Session and State"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-10/8-session-and-state"
    title: "8. Session and State"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-10/8-session-and-state"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5090-5090"
---
## 8. Session and State

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-15 | MCP session state lives in the adapter, not in business tables. | Boundary. | Session store. | V2 schema review. |
| MCP-16 | Business state is read and written only through operations. | Boundary. | — | V2 scan; V3 test. |
| MCP-17 | Resource and prompt surfaces that expose business data MUST read through a query operation; adapter-owned protocol metadata is the only exception. | Delegation. | Resource set. | V3 test. |
| MCP-18 | Protocol errors and business execution errors are mapped separately; a protocol failure is not reported as an operation error and vice versa. | Separation. | Detail. | V3 test. |
| MCP-19 | `McpConfig` records the adopted protocol version, transport profile, and capabilities. | Recorded. | Values. | V2 config check. |
| MCP-20 | The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources. | Boundary. | Policy. | V3 bypass test. |
| MCP-21 | Every tool result carries the operation's `request_id` in a machine-readable field. | Field. | Placement. | V3 test. |

---

## 9. Fixed and Open

## Rules in this section

- [MCP-15 — MCP session state lives in the adapter, not in business tables.](../../rules/c/mcp-15.md)
- [MCP-16 — Business state is read and written only through operations.](../../rules/c/mcp-16.md)
- [MCP-17 — Resource and prompt surfaces that expose business data MUST read through a qu...](../../rules/c/mcp-17.md)
- [MCP-18 — Protocol errors and business execution errors are mapped separately; a protoc...](../../rules/c/mcp-18.md)
- [MCP-19 — `McpConfig` records the adopted protocol version, transport profile, and capa...](../../rules/c/mcp-19.md)
- [MCP-20 — The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions)...](../../rules/c/mcp-20.md)
- [MCP-21 — Every tool result carries the operation's `request_id` in a machine-readable ...](../../rules/c/mcp-21.md)

