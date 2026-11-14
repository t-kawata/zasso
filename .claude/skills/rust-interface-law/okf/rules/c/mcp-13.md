---
type: "Rule"
title: "MCP-13 — Every operation category has an MCP mapping."
description: "Every operation category has an MCP mapping."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-13"
    title: "MCP-13"
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
x-rule-id: "MCP-13"
x-source-part: "Part III.10"
x-source-span: "137-137"
x-verification: "V3 mapping test."
---
# MCP-13

Every operation category has an MCP mapping.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 mapping test. |
| Enforcement | conformance driver |

[7. Errors](../../sources/part-iii-10/7-errors.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [MCP-14 — Error details never contain tokens, secrets, or raw provider responses.](mcp-14.md)

[^mcp-13]: sources/EXPERT-REVIEW-PACKAGE.md

