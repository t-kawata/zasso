---
type: "Section"
title: "7. Errors"
description: "| Operation category | MCP mapping |"
sources: 
  - resource: "sources/34-MCP.md"
    id: "34-mcp-7-errors"
    title: "7. Errors"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/34-MCP.md"
x-source-span: "117-141"
---
## 7. Errors

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

The exact JSON-RPC error code or MCP error variant is fixed by the adopted MCP
specification version. The adapter records that version in `McpConfig`.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-13 | Every operation category has an MCP mapping. | Coverage. | Detail text. | V3 mapping test. |
| MCP-14 | Error details never contain tokens, secrets, or raw provider responses. | Forbidden. | — | V2 scan; V3 test. |

---

