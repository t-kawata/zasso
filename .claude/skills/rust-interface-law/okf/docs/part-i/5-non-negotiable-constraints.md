---
type: "Documentation"
title: "5. Non-Negotiable Constraints"
description: "The following are given; do not propose weakening them without a security"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/5-non-negotiable-constraints"
    title: "5. Non-Negotiable Constraints"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/5-non-negotiable-constraints"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "175-175"
---
## 5. Non-Negotiable Constraints

The following are given; do not propose weakening them without a security
argument:

- Rust and Cargo workspaces.
- `VerifiedIdentity` is unforgeable by adapters.
- Token validation order and required claims are fixed.
- Audience separation between interfaces is mandatory.
- Authorization must run inside the operation.
- Secrets, tokens, passwords, and authorization codes never appear in logs,
  errors, or metrics.
- The shared contracts are versioned and not forked per project.
- A project may implement only a subset of interfaces; absence must be declared.

---

## 6. Review Dimensions

