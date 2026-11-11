---
type: List
id: list/30-rest-adapter-8-openapi/1/9f5f6c47ccba
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: 9f5f6c47ccbae369a08ea71967110e0a80373591afdd1ce7a0808db3bfe354fb
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
- `openapi/generated.rs` derives `utoipa::OpenApi`.
- Every operation path and schema is generated from the catalog.
- Security scheme: `Bearer` (`bearerFormat = "JWT"`).
- Swagger UI is mounted at `/swagger-ui`; the JSON is at
  `/api-docs/openapi.json`.
- The document is part of the conformance check: a route that is not documented,
  or a documented route that is not served, is a failure.
