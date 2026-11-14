---
type: "Section"
title: "6.1 Add an operation"
description: "1. Add the operation to the catalog with the §11 template."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/6-1-add-an-operation"
    title: "6.1 Add an operation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/6-1-add-an-operation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1254-1254"
---
### 6.1 Add an operation

1. Add the operation to the catalog with the §11 template.
2. Generate the handler skeleton and interface bindings.
3. Implement `Operation::execute` in `*-operation`.
4. Add authorization inside the handler.
5. Add conformance cases (normal, failure, authorization).
6. Regenerate the interface bindings and matrix.

No shared contract changes.

### 6.2 Add a scope

