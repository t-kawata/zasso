---
type: "Section"
title: "8. OpenAPI"
description: "- `openapi/generated.rs` derives `utoipa::OpenApi`."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-6/8-openapi"
    title: "8. OpenAPI"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-6/8-openapi"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4086-4086"
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

## 9. Fixed and Open

