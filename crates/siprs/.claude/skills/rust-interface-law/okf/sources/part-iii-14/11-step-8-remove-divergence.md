---
type: "Section"
title: "11. Step 8 — Remove Divergence"
description: "Remove:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/11-step-8-remove-divergence"
    title: "11. Step 8 — Remove Divergence"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/11-step-8-remove-divergence"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6322-6322"
---
## 11. Step 8 — Remove Divergence

Remove:

- duplicated operation implementations in interfaces;
- raw `Authorization` parsing outside adapters;
- JWT-library imports in core/operation;
- transport types in core/operation;
- ad-hoc error enums in adapters;
- duplicate `VerifiedIdentity`/principal types;
- direct database access from adapters.

Each removal is preceded by a conformance test that proves the remaining path.

---

## 12. Step 9 — Additional Interfaces (MCP, A2A)

