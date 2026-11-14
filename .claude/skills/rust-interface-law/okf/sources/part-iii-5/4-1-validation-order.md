---
type: "Section"
title: "4.1 Validation order"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/4-1-validation-order"
    title: "4.1 Validation order"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/4-1-validation-order"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3581-3581"
---
### 4.1 Validation order

```text
alg allowlist
  → signature
  → iss
  → aud
  → exp / nbf
  → typ
  → sub
  → tenant / delegation
  → ver (token version)
  → jti revocation
```

A failure at any stage returns `AuthenticationError`. The interface maps it to
401; details are logged, never returned.

### 4.2 Claims

