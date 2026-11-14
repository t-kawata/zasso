---
type: "Section"
title: "5. Tool Mapping"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-10/5-tool-mapping"
    title: "5. Tool Mapping"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-10/5-tool-mapping"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5033-5033"
---
## 5. Tool Mapping

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-01 | Every applicable catalog operation has one MCP tool. | Mapping rule. | Applicable subset. | V3 catalog test. |
| MCP-02 | The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed. | Name algorithm. | Prefix. | V3 test. |
| MCP-03 | The tool input schema is generated from the operation request. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-04 | The tool output schema is generated from the operation response. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-05 | The tool handler converts input, calls the dispatcher, and maps the result. | Call path. | Conversion details. | V3 test. |
| MCP-06 | The tool handler contains no business logic. | Forbidden. | — | V2 scan; V4 review. |

A tool is applicable when the catalog marks it `mcp: true`. An operation marked
`mcp: false` must state a reason in the catalog.

---

## 6. Authorization

## Rules in this section

- [MCP-01 — Every applicable catalog operation has one MCP tool.](../../rules/c/mcp-01.md)
- [MCP-02 — The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed.](../../rules/c/mcp-02.md)
- [MCP-03 — The tool input schema is generated from the operation request.](../../rules/g/mcp-03.md)
- [MCP-04 — The tool output schema is generated from the operation response.](../../rules/g/mcp-04.md)
- [MCP-05 — The tool handler converts input, calls the dispatcher, and maps the result.](../../rules/c/mcp-05.md)
- [MCP-06 — The tool handler contains no business logic.](../../rules/c/mcp-06.md)

