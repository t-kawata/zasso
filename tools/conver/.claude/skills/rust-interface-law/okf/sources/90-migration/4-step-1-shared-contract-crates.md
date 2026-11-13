---
type: "Section"
title: "4. Step 1 — Shared Contract Crates"
description: "1. Add `operation-contract`, `interface-contract`, and `identity-core` as"
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-4-step-1-shared-contract-crates"
    title: "4. Step 1 — Shared Contract Crates"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "89-100"
---
## 4. Step 1 — Shared Contract Crates

1. Add `operation-contract`, `interface-contract`, and `identity-core` as
   dependencies.
2. If the project has a local copy, replace it with the versioned dependency.
3. Do not wrap the shared types in project-specific aliases; the contracts are
   the seam.

Verification: `cargo metadata` shows the shared crates and no duplicate copies.

---

