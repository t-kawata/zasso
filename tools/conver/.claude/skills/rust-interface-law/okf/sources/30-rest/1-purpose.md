---
type: "Section"
title: "1. Purpose"
description: "`*-rest` is a thin HTTP adapter. It extracts the bearer token, verifies it,"
sources: 
  - resource: "sources/30-REST.md"
    id: "30-rest-1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/30-REST.md"
x-source-span: "10-17"
---
## 1. Purpose

`*-rest` is a thin HTTP adapter. It extracts the bearer token, verifies it,
converts the HTTP body to the operation request, calls the dispatcher, converts
the result, and maps errors to HTTP. It contains no business logic.

---

