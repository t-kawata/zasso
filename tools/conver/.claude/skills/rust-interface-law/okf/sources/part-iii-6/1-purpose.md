---
type: "Section"
title: "1. Purpose"
description: "`*-rest` is a thin HTTP adapter. It extracts the bearer token, verifies it,"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-6/1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-6/1-purpose"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3883-3883"
---
## 1. Purpose

`*-rest` is a thin HTTP adapter. It extracts the bearer token, verifies it,
converts the HTTP body to the operation request, calls the dispatcher, converts
the result, and maps errors to HTTP. It contains no business logic.

---

## 2. Dependencies

