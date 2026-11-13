---
type: Table
id: table/34-mcp-adapter-11-implementation-contract-11-5-rules/1/4ba8ad9c0047
phase: adapter
delivery: reference
applies_to: mcp
requires: []
references: []
content_sha256: 4ba8ad9c00473e2f91d5f6fcd3deae6885d597b710cd0e84b47eddd49741125a
source: sources/34-MCP.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-22 | MCP adapters MUST register generated tools through the admitted rmcp tool router and MUST dispatch through the shared Dispatcher. | Tool router. | Tool descriptions. | V2 source; V3 tool test. |
| MCP-23 | Every MCP deployment MUST declare its session and replay capabilities and MUST pass cross-instance tests for those capabilities. | Profile. | Storage backend. | V3 process test. |
| MCP-24 | MCP JSON and SSE responses MUST use SDK framing and MUST share the same tool execution path. | Dual mode. | Encoding. | V3 dual-mode test. |
| MCP-25 | Resumable MCP profiles MUST persist event cursors and MUST pass restart replay without sticky routing. | Replay. | Retention. | V3 restart test. |
| MCP-26 | MCP cancellation and progress MUST map to the dispatcher and MUST NOT buffer unsupported operations. | Cancellation. | Notification text. | V3 cancel/progress test. |
| MCP-27 | MCP authorization MUST expose discovery and challenge, bind the configured audience, and MUST NOT pass a received token downstream. | Auth boundary. | Realm text. | V3 auth test. |
