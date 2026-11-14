---
type: "Section"
title: "2.3 Delegation"
description: "`sub` is the subject. `act` is the actor. `on_behalf_of` is the delegated"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/2-3-delegation"
    title: "2.3 Delegation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/2-3-delegation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1664-1664"
---
### 2.3 Delegation

`sub` is the subject. `act` is the actor. `on_behalf_of` is the delegated
subject. The verifier MUST validate that:

- the actor is authorized to act for the subject;
- the delegated scopes are a subset of both the actor's and the subject's
  scopes;
- `on_behalf_of` is explicit and is never inferred from `sub`.

---

## 3. Authentication Contracts

