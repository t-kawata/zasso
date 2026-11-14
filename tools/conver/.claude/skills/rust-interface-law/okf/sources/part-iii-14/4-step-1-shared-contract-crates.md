---
type: "Section"
title: "4. Step 1 — Shared Contract Crates"
description: "1. Add `operation-contract`, `interface-contract`, and `identity-core` as"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/4-step-1-shared-contract-crates"
    title: "4. Step 1 — Shared Contract Crates"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/4-step-1-shared-contract-crates"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6179-6179"
---
## 4. Step 1 — Shared Contract Crates

1. Add `operation-contract`, `interface-contract`, and `identity-core` as
   dependencies.
2. If the project has a local copy, replace it with the versioned dependency.
3. Do not wrap the shared types in project-specific aliases; the contracts are
   the seam.

Verification: `cargo metadata` shows the shared crates and no duplicate copies.

---

## 5. Step 2 — Identity Crates

