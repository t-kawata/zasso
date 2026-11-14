---
type: "Rule"
title: "MCP-02 — The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed."
description: "The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed."
sources: 
  - resource: "sources/34-MCP.md"
    id: "mcp-02"
    title: "MCP-02"
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
x-rule-id: "MCP-02"
x-source-part: "Part III.10"
x-source-span: "90-90"
x-verification: "V3 test."
---
# MCP-02

The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed.

| Field | Value |
|---|---|
| Class | C |
| Applies to | mcp |
| Parent | MCP |
| Source part | Part III.10 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[5. Tool Mapping](../../sources/part-iii-10/5-tool-mapping.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [MCP-01 — Every applicable catalog operation has one MCP tool.](mcp-01.md)
- [MCP-03 — The tool input schema is generated from the operation request.](../g/mcp-03.md)
- [MCP-04 — The tool output schema is generated from the operation response.](../g/mcp-04.md)
- [MCP-05 — The tool handler converts input, calls the dispatcher, and maps the result.](mcp-05.md)
- [MCP-06 — The tool handler contains no business logic.](mcp-06.md)

[^mcp-02]: sources/EXPERT-REVIEW-PACKAGE.md

