---
type: Table
id: table/34-mcp-adapter-8-session-and-state/1/79f686acc26e
phase: adapter
delivery: reference
applies_to: mcp
requires: []
references: []
content_sha256: 79f686acc26e7c9c4cd30fd3d5e9d57bcbc6fe271faf6881232c7b1567bc21e9
source: docs/archive/IMPLEMENTATION-SPEC/34-MCP.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-15 | MCP session state lives in the adapter, not in business tables. | Boundary. | Session store. | V2 schema review. |
| MCP-16 | Business state is read and written only through operations. | Boundary. | — | V2 scan; V3 test. |
| MCP-17 | Resource and prompt surfaces that expose business data MUST read through a query operation; adapter-owned protocol metadata is the only exception. | Delegation. | Resource set. | V3 test. |
| MCP-18 | Protocol errors and business execution errors are mapped separately; a protocol failure is not reported as an operation error and vice versa. | Separation. | Detail. | V3 test. |
| MCP-19 | `McpConfig` records the adopted protocol version, transport profile, and capabilities. | Recorded. | Values. | V2 config check. |
| MCP-20 | The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources. | Boundary. | Policy. | V3 bypass test. |
| MCP-21 | Every tool result carries the operation's `request_id` in a machine-readable field. | Field. | Placement. | V3 test. |
