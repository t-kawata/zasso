---
type: "Rule"
title: "IDN-11 — Sessions are independent of the login method."
description: "Sessions are independent of the login method."
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "idn-11"
    title: "IDN-11"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "auth-jwt"
x-enforcement: "negative-auth suite"
x-parent: "IDN"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "O/C"
x-rule-id: "IDN-11"
x-source-part: "Part III.5"
x-source-span: "190-190"
x-verification: "V2 schema check."
---
# IDN-11

Sessions are independent of the login method.

| Field | Value |
|---|---|
| Class | O/C |
| Applies to | auth-jwt |
| Parent | IDN |
| Source part | Part III.5 |
| Verification | V2 schema check. |
| Enforcement | negative-auth suite |

[7. Refresh Tokens and Sessions](../../../sources/part-iii-5/7-refresh-tokens-and-sessions.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../../c/arc-01.md)
- [IDN-07 — Refresh tokens are opaque random values, not JWTs.](idn-07.md)
- [IDN-08 — Only a hash is stored.](idn-08.md)
- [IDN-09 — Every use consumes and rotates the token atomically.](idn-09.md)
- [IDN-10 — Reuse of a consumed token revokes the session family.](idn-10.md)
- [IDN-12 — `users.token_version` is included in claims as `ver` and checked.](idn-12.md)
- [IDN-13 — Consume and next-generation insert happen in one transaction; `(family_id, ge...](idn-13.md)
- [IDN-14 — The loser of concurrent refresh receives `invalid_grant`; idempotent grace re...](idn-14.md)

[^idn-11]: sources/EXPERT-REVIEW-PACKAGE.md

