---
type: "Section"
title: "10. Step 7 — Interfaces"
description: "Adopt only the profiles the project needs. The recommended order within the"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/10-step-7-interfaces"
    title: "10. Step 7 — Interfaces"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/10-step-7-interfaces"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6302-6302"
---
## 10. Step 7 — Interfaces

Adopt only the profiles the project needs. The recommended order within the
selected set is REST → WebSocket → CLI → gRPC → MCP → A2A, but the set is the
project's choice.

For each selected interface:

1. Generate bindings from the catalog.
2. Implement the driver contract.
3. Set the profile to `true` in `RULES-PROFILE.toml`.
4. Add the conformance matrix column.
5. Pass the negative suite, audience isolation, and binding checks.
6. Remove the old hand-written path only after the new path passes.

A project that needs only MCP or A2A may implement it first. It must still pass
the same operation, authorization, and conformance obligations.

---

## 11. Step 8 — Remove Divergence

