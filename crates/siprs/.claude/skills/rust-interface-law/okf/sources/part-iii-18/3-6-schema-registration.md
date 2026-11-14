---
type: "Section"
title: "3.6 Schema Registration"
description: "The macro emits `schemars::schema_for!(Type)` through the inventory"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/3-6-schema-registration"
    title: "3.6 Schema Registration"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/3-6-schema-registration"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7715-7715"
---
### 3.6 Schema Registration

The macro emits `schemars::schema_for!(Type)` through the inventory
registration. The docgen dump calls the function pointer; the schema is a
normal `schemars::Schema`.

If the project uses `utoipa` for REST, it MAY also derive `utoipa::ToSchema`.
The neutral `schemars` registry remains authoritative for all interfaces, and a
gate compares the OpenAPI schema against the neutral schema for the same type.

### 3.7 Runtime Validation Path

