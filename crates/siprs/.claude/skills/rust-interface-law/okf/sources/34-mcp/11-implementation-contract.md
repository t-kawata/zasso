---
type: "Section"
title: "11. Implementation Contract"
description: "`rmcp = { version = \"=0.8.5\", features = [\"server\", \"macros\", \"transport-streamable-http-server\"] }`; `axum = { version = \"=0.8.9\", features = [\"http1\", \"tokio\", \"json\"] }`."
sources: 
  - resource: "sources/34-MCP.md"
    id: "34-mcp-11-implementation-contract"
    title: "11. Implementation Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/34-MCP.md"
x-source-span: "183-211"
---
## 11. Implementation Contract

### 11.1 Cargo contract

`rmcp = { version = "=0.8.5", features = ["server", "macros", "transport-streamable-http-server"] }`; `axum = { version = "=0.8.9", features = ["http1", "tokio", "json"] }`.

### 11.2 Required API sequence

Tool manifest -> SDK tool router -> input/output schema -> HTTP auth -> dispatcher -> JSON or SSE response -> cancellation/progress correlation.

### 11.3 Forbidden patterns

hand-written JSON-RPC, local authoritative session map, sticky-session dependency, ad-hoc SSE framing, whole-stream buffering.

### 11.4 Template

`templates/mcp/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-22 | MCP adapters MUST register generated tools through the admitted rmcp tool router and MUST dispatch through the shared Dispatcher. | Tool router. | Tool descriptions. | V2 source; V3 tool test. |
| MCP-23 | Every MCP deployment MUST declare its session and replay capabilities and MUST pass cross-instance tests for those capabilities. | Profile. | Storage backend. | V3 process test. |
| MCP-24 | MCP JSON and SSE responses MUST use SDK framing and MUST share the same tool execution path. | Dual mode. | Encoding. | V3 dual-mode test. |
| MCP-25 | Resumable MCP profiles MUST persist event cursors and MUST pass restart replay without sticky routing. | Replay. | Retention. | V3 restart test. |
| MCP-26 | MCP cancellation and progress MUST map to the dispatcher and MUST NOT buffer unsupported operations. | Cancellation. | Notification text. | V3 cancel/progress test. |
| MCP-27 | MCP authorization MUST expose discovery and challenge, bind the configured audience, and MUST NOT pass a received token downstream. | Auth boundary. | Realm text. | V3 auth test. |

