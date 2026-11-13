---
type: Table
id: table/34-mcp-adapter-5-tool-mapping/1/0f18ace4e604
phase: adapter
delivery: reference
applies_to: mcp
requires: []
references: []
content_sha256: 0f18ace4e604c8d61366a511e8f772305afd2bc007738fa0d3f0cbfddfea2d99
source: sources/34-MCP.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-01 | Every applicable catalog operation has one MCP tool. | Mapping rule. | Applicable subset. | V3 catalog test. |
| MCP-02 | The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed. | Name algorithm. | Prefix. | V3 test. |
| MCP-03 | The tool input schema is generated from the operation request. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-04 | The tool output schema is generated from the operation response. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-05 | The tool handler converts input, calls the dispatcher, and maps the result. | Call path. | Conversion details. | V3 test. |
| MCP-06 | The tool handler contains no business logic. | Forbidden. | — | V2 scan; V4 review. |
