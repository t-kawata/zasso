---
type: "Section"
title: "11. Errors"
description: "`error/mapping.rs` maps `DomainError` to `OperationError`. Every"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/11-errors"
    title: "11. Errors"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/11-errors"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3461-3461"
---
## 11. Errors

`error/mapping.rs` maps `DomainError` to `OperationError`. Every
`DomainErrorCode` has a mapping; an unknown code is a defect and fails the
build. Adapters receive `OperationErrorBody`; the internal `source` is never
serialized.

---

## 12. Registry

