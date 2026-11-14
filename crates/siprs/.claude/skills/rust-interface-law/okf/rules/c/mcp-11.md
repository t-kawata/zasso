---
type: "Rule"
title: "MCP-11 — A received token MUST NOT be passed through to a downstream API."
description: "A received token MUST NOT be passed through to a downstream API."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-11"
    title: "MCP-11"
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
x-rule-id: "MCP-11"
x-source-part: "Part III.10"
x-source-span: "112-112"
x-verification: "V2 scan; V3 test."
---
# MCP-11

A received token MUST NOT be passed through to a downstream API.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V2 scan; V3 test. |
| Enforcement | conformance driver |

[6. Authorization](../../sources/part-iii-10/6-authorization.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [MCP-07 — Authorization server metadata is exposed at the configured discovery endpoint.](mcp-07.md)
- [MCP-08 — Protected resource metadata identifies this MCP server as the audience.](mcp-08.md)
- [MCP-09 — Unauthenticated requests receive the spec-required challenge.](mcp-09.md)
- [MCP-10 — Tokens are verified by the shared `AccessTokenVerifier` with the MCP audience.](mcp-10.md)
- [MCP-12 — The adapter does not authorize the target; the operation does.](mcp-12.md)

[^mcp-11]: sources/EXPERT-REVIEW-PACKAGE.md

