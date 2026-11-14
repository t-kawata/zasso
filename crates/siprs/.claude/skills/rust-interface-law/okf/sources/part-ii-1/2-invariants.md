---
type: "Section"
title: "2. Invariants"
description: "These invariants hold for every project that adopts this document."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/2-invariants"
    title: "2. Invariants"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/2-invariants"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "580-580"
---
## 2. Invariants

These invariants hold for every project that adopts this document.

| ID | Invariant |
|---|---|
| INV-01 | One business implementation exists per operation. Interfaces do not reimplement it. |
| INV-02 | Every interface calls the same operation implementation. |
| INV-03 | Authentication happens once per request; authorization happens inside the operation. |
| INV-04 | `*-core` and `*-operation` contain no transport, JWT-library, or SSO-provider types. |
| INV-05 | SSO is added without changing business operations, `VerifiedIdentity`, or business tables. |
| INV-06 | Conformance tests, not documentation, prove compliance. |
| INV-07 | A token issued for one interface is not accepted by another. |
| INV-08 | No side effect occurs before authorization succeeds. |

---

## 3. Crate Architecture

## Rules in this section

- [INV-06 — Conformance tests, not documentation, prove compliance.](../../rules/c/inv-06.md)

