---
type: Table
id: table/50-project-template-8-naming/1/eff84d5148dc
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: eff84d5148dc02a77c8f988c82c50cb191b5521d6730c825abd915ed3bf126b6
source: docs/archive/IMPLEMENTATION-SPEC/50-PROJECT-TEMPLATE.md
---
| Item | Rule |
|---|---|
| Crates | `<project>-<role>`; shared crates have no project prefix. |
| Modules | `snake_case`; public module layout follows the role spec. |
| Types | `PascalCase`; request/response end with `Request`/`Response`. |
| Operation IDs | `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$`. |
| Handler file | `<project>-operation/src/handlers/<domain>/<action>.rs`. |
| REST path | `<domain>/<action>` with path parameters for targets. |
| CLI command | `<domain> <action>` with kebab-case flags. |
| gRPC method | PascalCase of the operation ID. |
| MCP/A2A tool/skill | operation ID with `.` replaced by `_`. |
| Audience | one per interface (`rest`, `websocket`, `cli`, `grpc`, `mcp`, `a2a`). |
| Conformance ID | `CF_<operation_id with dots replaced by underscores>`. |
