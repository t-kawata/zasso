---
type: "Section"
title: "2. Crates"
description: "| Crate | Role | May depend on |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/2-crates"
    title: "2. Crates"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/2-crates"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3529-3529"
---
## 2. Crates

| Crate | Role | May depend on |
|---|---|---|
| `identity-core` | Identity types, `VerifiedIdentity`, `CredentialBinding`, auth traits, JWT and ticket implementations behind features. | Pure utility crates only. |
| `identity-jwt` | Facade re-exporting `identity_core::jwt`. | `identity-core`. |
| `identity-local` | Password and local credential verification. | `identity-core`. |
| `identity-operation` | Login orchestration, token issue operation, external identity resolution. | `identity-core`. |
| `identity-sso` | OIDC/SSO provider implementation. | `identity-core`. |

`identity-operation` MUST NOT depend on `identity-jwt`, `identity-local`, or
`identity-sso`. The assembly wires them.

The JWT verifier and session-ticket store live inside `identity-core` behind the
`jwt` and `ticket` features. `identity-jwt` is a facade. This makes
`VerifiedIdentity` constructible only inside `identity-core`.

---

## 3. Layout

