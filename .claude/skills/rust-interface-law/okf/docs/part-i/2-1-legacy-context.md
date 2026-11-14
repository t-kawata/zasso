---
type: "Documentation"
title: "2.1 Legacy context"
description: "An earlier system (`mycute`) implemented a REST API with Axum and `utoipa` in a"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/2-1-legacy-context"
    title: "2.1 Legacy context"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/2-1-legacy-context"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "41-41"
---
### 2.1 Legacy context

An earlier system (`mycute`) implemented a REST API with Axum and `utoipa` in a
single module tree (`src/mode/rt`). That implementation is **not** the target
architecture. It is mentioned only to explain why the new rules exist: the old
design coupled HTTP handling, business logic, persistence, authentication, and
OpenAPI generation in one place. The new architecture separates them.

### 2.2 Target architecture

