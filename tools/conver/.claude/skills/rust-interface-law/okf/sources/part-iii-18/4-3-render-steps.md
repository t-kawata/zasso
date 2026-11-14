---
type: "Section"
title: "4.3 Render Steps"
description: "1. Read catalog and bindings."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/4-3-render-steps"
    title: "4.3 Render Steps"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/4-3-render-steps"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7855-7855"
---
### 4.3 Render Steps

1. Read catalog and bindings.
2. Read both registry JSON files.
3. For each operation, resolve request/response schemas and validation
   descriptors.
4. For each implemented profile, render its reference and, for REST, the
   OpenAPI document.
5. Run `check all`.
6. Write outputs atomically: write to a temporary directory, then rename.

### 4.4 Check Implementations

