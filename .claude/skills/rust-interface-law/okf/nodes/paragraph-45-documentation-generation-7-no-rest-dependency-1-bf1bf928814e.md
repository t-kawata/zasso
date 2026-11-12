---
type: Paragraph
id: paragraph/45-documentation-generation-7-no-rest-dependency/1/bf1bf928814e
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: bf1bf928814e30893fee568998703f9fa76802c023d623b07292c086c44b8fa4
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
Schema generation MUST NOT require a running REST server, a REST router, or the
REST adapter. `utoipa::ToSchema` or `schemars::JsonSchema` produces schema
information without serving HTTP.
