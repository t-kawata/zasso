---
type: "Section"
title: "6. Authorization"
description: "The adapter implements the authorization surface required by the adopted MCP"
sources: 
  - resource: "sources/34-MCP.md"
    id: "34-mcp-6-authorization"
    title: "6. Authorization"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/34-MCP.md"
x-source-span: "101-116"
---
## 6. Authorization

The adapter implements the authorization surface required by the adopted MCP
specification:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-07 | Authorization server metadata is exposed at the configured discovery endpoint. | Endpoint exists. | Metadata content. | V3 protocol test. |
| MCP-08 | Protected resource metadata identifies this MCP server as the audience. | Audience binding. | Metadata fields. | V3 test. |
| MCP-09 | Unauthenticated requests receive the spec-required challenge. | Challenge. | Realm text. | V3 test. |
| MCP-10 | Tokens are verified by the shared `AccessTokenVerifier` with the MCP audience. | Verification path. | — | V3 test. |
| MCP-11 | A received token MUST NOT be passed through to a downstream API. | Forbidden. | — | V2 scan; V3 test. |
| MCP-12 | The adapter does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |

---

