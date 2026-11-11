---
type: Paragraph
id: paragraph/50-project-template-4-schema-source/2/208d1bf1fa1f
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 208d1bf1fa1fedaed05995725775c8cdaf9862905372be93f9de462e1135f2bb
source: docs/archive/IMPLEMENTATION-SPEC/50-PROJECT-TEMPLATE.md
---
The generator consumes the neutral schema registry and the validation
descriptor registry. It emits REST schemas, MCP tool schemas, A2A skill
schemas, CLI flags, OpenAPI entries, and validation constraint tables.
Protocol-specific annotations (for example `utoipa`) belong to the adapter, not
to the operation DTO. Do not hand-write a second constraint list in the
documentation.
