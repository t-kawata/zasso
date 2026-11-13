---
type: "Section"
title: "11. Implementation Contract"
description: "`axum = { version = \"=0.8.9\", features = [\"json\"] }`; `tower-http = { version = \"=0.6.6\", features = [\"cors\", \"trace\", \"request-id\"] }`; `utoipa = { version = \"=5.4.0\", features = [\"macros\", \"axum_ext"
sources: 
  - resource: "sources/30-REST.md"
    id: "30-rest-11-implementation-contract"
    title: "11. Implementation Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/30-REST.md"
x-source-span: "252-277"
---
## 11. Implementation Contract

### 11.1 Cargo contract

`axum = { version = "=0.8.9", features = ["json"] }`; `tower-http = { version = "=0.6.6", features = ["cors", "trace", "request-id"] }`; `utoipa = { version = "=5.4.0", features = ["macros", "axum_extras"] }`; `utoipa-swagger-ui = { version = "=9.0.2", features = ["axum", "vendored"] }`.

### 11.2 Required API sequence

CORS and preflight -> protected auth -> body limit -> decode -> dispatcher -> semantic renderer -> request_id header.

### 11.3 Forbidden patterns

`actix-web`, `warp`, `poem`, hand-written HTTP server, handler-to-operation implementation call, second wire envelope.

### 11.4 Template

`templates/rest/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| REST-19 | REST adapters MUST use the admitted HTTP crate and call the shared dispatcher through the adapter bridge. | Admission. | Handler conversion. | V2 source; V3 route test. |
| REST-20 | Every REST rejection path MUST use the shared semantic error renderer and the canonical request_id. | Shared renderer. | Error text. | V3 rejection fixtures. |
| REST-21 | OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime. | Generation source. | Descriptions. | V3 equality test. |

