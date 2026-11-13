---
type: List
id: list/90-migration-6-step-3-operation-catalog/1/752a58a0f838
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 752a58a0f8388296a622d59571000e2cb7435a9c197e9d83024397cf5d47962f
source: sources/90-MIGRATION.md
---
1. Extract every operation from `SYSTEM-DESIGN.md`, RFCs, and handlers.
2. Add each entry to `contract/operation-catalog.toml` using the §11 template.
3. Assign scope, mode, interfaces, MCP/A2A applicability, and conformance ID.
4. Mark missing interface bindings as `not applicable` with a reason.
5. Generate skeletons and the matrix.
