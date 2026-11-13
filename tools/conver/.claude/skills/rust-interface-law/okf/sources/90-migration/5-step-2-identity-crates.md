---
type: "Section"
title: "5. Step 2 — Identity Crates"
description: "1. Add `identity-jwt`, `identity-local`, and `identity-operation`."
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-5-step-2-identity-crates"
    title: "5. Step 2 — Identity Crates"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "101-115"
---
## 5. Step 2 — Identity Crates

1. Add `identity-jwt`, `identity-local`, and `identity-operation`.
2. Replace the existing JWT verifier with `AccessTokenVerifier`.
3. Replace the existing login endpoint with the `auth.token.issue` operation.
4. Replace ad-hoc principal types with `VerifiedIdentity`.
5. Add the negative JWT suite.
6. If SSO is planned, add the `identity-sso` placeholder crate but do not
   implement a provider yet.

Verification: negative suite passes; no `Authorization` parsing outside the
adapters; no raw JWT in operation code.

---

