---
type: Table
id: table/34-mcp-adapter-6-authorization/1/ee920ff70090
phase: adapter
delivery: reference
applies_to: mcp
requires: []
references: []
content_sha256: ee920ff700900420604ac6b5f8d6dd3a759b6486a70cc842207ba42ea015f4e1
source: docs/archive/IMPLEMENTATION-SPEC/34-MCP.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-07 | Authorization server metadata is exposed at the configured discovery endpoint. | Endpoint exists. | Metadata content. | V3 protocol test. |
| MCP-08 | Protected resource metadata identifies this MCP server as the audience. | Audience binding. | Metadata fields. | V3 test. |
| MCP-09 | Unauthenticated requests receive the spec-required challenge. | Challenge. | Realm text. | V3 test. |
| MCP-10 | Tokens are verified by the shared `AccessTokenVerifier` with the MCP audience. | Verification path. | — | V3 test. |
| MCP-11 | A received token MUST NOT be passed through to a downstream API. | Forbidden. | — | V2 scan; V3 test. |
| MCP-12 | The adapter does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |
