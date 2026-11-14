---
type: "Section"
title: "7. No REST Dependency"
description: "Schema generation MUST NOT require a running REST server, a REST router, or the"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-16/7-no-rest-dependency"
    title: "7. No REST Dependency"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-16/7-no-rest-dependency"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7039-7039"
---
## 7. No REST Dependency

Schema generation MUST NOT require a running REST server, a REST router, or the
REST adapter. `utoipa::ToSchema` or `schemars::JsonSchema` produces schema
information without serving HTTP.

A project that implements only MCP, A2A, CLI, WebSocket, or gRPC MUST still
generate its interface documentation. REST profiles are optional.

---

## 8. Determinism and Versioning

