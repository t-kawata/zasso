---
type: "Section"
title: "5. Tool Mapping"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/34-MCP.md"
    id: "34-mcp-5-tool-mapping"
    title: "5. Tool Mapping"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/34-MCP.md"
x-source-span: "85-100"
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

