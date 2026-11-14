---
type: "Section"
title: "6. Step 3 — Operation Catalog"
description: "1. Extract every operation from `SYSTEM-DESIGN.md`, RFCs, and handlers."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/6-step-3-operation-catalog"
    title: "6. Step 3 — Operation Catalog"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/6-step-3-operation-catalog"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6206-6206"
---
## 6. Step 3 — Operation Catalog

1. Extract every operation from `SYSTEM-DESIGN.md`, RFCs, and handlers.
2. Add each entry to `contract/operation-catalog.toml` using the §11 template.
3. Assign scope, mode, interfaces, MCP/A2A applicability, and conformance ID.
4. Mark missing interface bindings as `not applicable` with a reason.
5. Generate skeletons and the matrix.

Verification: every existing handler maps to exactly one catalog entry; every
catalog entry has a handler and a conformance ID.

---

## 7. Step 4 — Crate Mapping

