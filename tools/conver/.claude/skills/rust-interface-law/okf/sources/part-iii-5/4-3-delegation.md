---
type: "Section"
title: "4.3 Delegation"
description: "`sub` is the delegated subject, `act` is the actor. Validation MUST ensure:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/4-3-delegation"
    title: "4.3 Delegation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/4-3-delegation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3621-3621"
---
### 4.3 Delegation

`sub` is the delegated subject, `act` is the actor. Validation MUST ensure:

- the actor is authorized to act for the subject;
- delegated scopes are a subset of both the actor's and the subject's scopes;
- `on_behalf_of` is explicit and is not inferred from `sub`;
- the `VerifiedIdentity` preserves `actor` and `on_behalf_of` for audit.

---

## 5. Keys

