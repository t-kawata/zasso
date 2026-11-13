---
type: "Section"
title: "6. Step 3 — Operation Catalog"
description: "1. Extract every operation from `SYSTEM-DESIGN.md`, RFCs, and handlers."
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-6-step-3-operation-catalog"
    title: "6. Step 3 — Operation Catalog"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "116-128"
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

