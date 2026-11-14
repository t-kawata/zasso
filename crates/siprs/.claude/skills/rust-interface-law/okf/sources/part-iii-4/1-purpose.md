---
type: "Section"
title: "1. Purpose"
description: "`*-operation` is the only place where business operations are implemented. It"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/1-purpose"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3135-3135"
---
## 1. Purpose

`*-operation` is the only place where business operations are implemented. It
registers authenticated and anonymous operations, implements authorization and
transaction boundaries, and enqueues outbox events. The dispatcher itself is a
shared contract implementation, not a project crate, so that it can construct
authenticated contexts and enforce credential binding.

---

## 2. Dependencies

