---
type: "Section"
title: "9. Negative Authentication Tests"
description: "In addition to `alg=none`, disallowed algorithm, tampered signature, expired,"
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "22-identity-9-negative-authentication-tests"
    title: "9. Negative Authentication Tests"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/22-IDENTITY.md"
x-source-span: "305-327"
---
## 9. Negative Authentication Tests

In addition to `alg=none`, disallowed algorithm, tampered signature, expired,
wrong `iss`, wrong `aud`, missing `sub`, wrong `typ`, unknown `kid`,
`jku`/`x5u`, missing header, and token in query, the suite MUST include:

- missing required claim (`jti`, `ver`, `iat`);
- future `nbf`;
- wrong claim type (for example `sub` as a number);
- `ver` below the user's token version;
- revoked `jti`;
- concurrent refresh with one winner;
- refresh reuse inside and outside the grace window;
- family revocation after reuse;
- delegation with an unauthorized actor;
- delegation with scopes exceeding the actor or subject;
- `on_behalf_of` inconsistent with `act`.

The negative suite is not a claim of complete authentication correctness; it is
the minimum rejection set.

---

