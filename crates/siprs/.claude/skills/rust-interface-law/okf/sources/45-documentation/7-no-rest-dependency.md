---
type: "Section"
title: "7. No REST Dependency"
description: "Schema generation MUST NOT require a running REST server, a REST router, or the"
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "45-documentation-7-no-rest-dependency"
    title: "7. No REST Dependency"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/45-DOCUMENTATION.md"
x-source-span: "146-156"
---
## 7. No REST Dependency

Schema generation MUST NOT require a running REST server, a REST router, or the
REST adapter. `utoipa::ToSchema` or `schemars::JsonSchema` produces schema
information without serving HTTP.

A project that implements only MCP, A2A, CLI, WebSocket, or gRPC MUST still
generate its interface documentation. REST profiles are optional.

---

