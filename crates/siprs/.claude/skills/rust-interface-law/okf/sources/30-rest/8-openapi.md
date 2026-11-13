---
type: "Section"
title: "8. OpenAPI"
description: "- `openapi/generated.rs` derives `utoipa::OpenApi`."
sources: 
  - resource: "sources/30-REST.md"
    id: "30-rest-8-openapi"
    title: "8. OpenAPI"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/30-REST.md"
x-source-span: "213-224"
---
## 8. OpenAPI

- `openapi/generated.rs` derives `utoipa::OpenApi`.
- Every operation path and schema is generated from the catalog.
- Security scheme: `Bearer` (`bearerFormat = "JWT"`).
- Swagger UI is mounted at `/swagger-ui`; the JSON is at
  `/api-docs/openapi.json`.
- The document is part of the conformance check: a route that is not documented,
  or a documented route that is not served, is a failure.

---

