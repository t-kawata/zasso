---
type: Table
id: table/34-mcp-adapter-7-errors/1/58ae67faca16
phase: adapter
delivery: reference
applies_to: mcp
requires: []
references: []
content_sha256: 58ae67faca162e0deef704ed71b2c832f90d7012133f395435bbdbaea73434ea
source: docs/archive/IMPLEMENTATION-SPEC/34-MCP.md
---
| Operation category | MCP mapping |
|---|---|
| `invalid_input`, `invalid_config` | `InvalidParams` |
| `unauthenticated` | `Unauthorized` / spec challenge |
| `permission_denied` | `Forbidden` |
| `not_found` | `NotFound` |
| `already_exists`, `conflict`, `invalid_state` | `InvalidRequest` / conflict detail |
| `resource_exhausted` | `RateLimited` / capacity detail |
| `unsupported` | `MethodNotFound` / unsupported detail |
| `timeout`, `cancelled` | `Cancelled` / timeout detail |
| `unavailable` | `ServiceUnavailable` |
| `internal` | `InternalError` |
