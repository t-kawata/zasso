---
type: "Section"
title: "8. Naming"
description: "| Item | Rule |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-13/8-naming"
    title: "8. Naming"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-13/8-naming"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6016-6016"
---
## 8. Naming

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

The generator rejects collisions after applying these transformations.

---

## 9. Build and Verification

