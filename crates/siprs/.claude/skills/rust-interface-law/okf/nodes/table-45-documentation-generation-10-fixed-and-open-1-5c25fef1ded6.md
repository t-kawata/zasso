---
type: Table
id: table/45-documentation-generation-10-fixed-and-open/1/5c25fef1ded6
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 5c25fef1ded6b91cbd5284713ccc23aeb7dc10de8892180e4c14435e8dcdac86
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
| Fixed | Open |
|---|---|
| Inputs, outputs, completeness, English-only, determinism, secret-free. | Renderer, template, static-site generator. |
| Operation catalog as the operation list. | Catalog documentation fields beyond the required set. |
| Schema registry as the neutral source. | `schemars` or `utoipa` selection. |
| Per-interface references and OpenAPI/Swagger. | Visual presentation and navigation. |
| No REST dependency. | Build orchestration. |
| Version and digest metadata. | Artifact storage. |
