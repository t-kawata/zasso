---
type: "Section"
title: "7. Refresh Tokens and Sessions"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/7-refresh-tokens-and-sessions"
    title: "7. Refresh Tokens and Sessions"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/7-refresh-tokens-and-sessions"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3693-3693"
---
## 7. Refresh Tokens and Sessions

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| IDN-07 | Refresh tokens are opaque random values, not JWTs. | Format. | Length and source. | V3 test. |
| IDN-08 | Only a hash is stored. | Hash storage. | Hash algorithm. | V3 DB test. |
| IDN-09 | Every use consumes and rotates the token atomically. | Atomic consume. | SQL/store. | V3 concurrency test. |
| IDN-10 | Reuse of a consumed token revokes the session family. | Family revocation. | Detection window. | V3 test. |
| IDN-11 | Sessions are independent of the login method. | `sessions` table. | Extra columns. | V2 schema check. |
| IDN-12 | `users.token_version` is included in claims as `ver` and checked. | Claim and check. | Storage. | V3 test. |
| IDN-13 | Consume and next-generation insert happen in one transaction; `(family_id, generation)` is unique. | Atomic boundary. | SQL/store. | V3 concurrency test. |
| IDN-14 | The loser of concurrent refresh receives `invalid_grant`; idempotent grace requires an encrypted replacement cache, not a hash-only record. | Loser policy. | Grace mechanism. | V3 test. |

### 7.1 Schema

## Rules in this section

- [IDN-07 — Refresh tokens are opaque random values, not JWTs.](../../rules/o/c/idn-07.md)
- [IDN-08 — Only a hash is stored.](../../rules/o/c/idn-08.md)
- [IDN-09 — Every use consumes and rotates the token atomically.](../../rules/o/c/idn-09.md)
- [IDN-10 — Reuse of a consumed token revokes the session family.](../../rules/o/c/idn-10.md)
- [IDN-11 — Sessions are independent of the login method.](../../rules/o/c/idn-11.md)
- [IDN-12 — `users.token_version` is included in claims as `ver` and checked.](../../rules/o/c/idn-12.md)
- [IDN-13 — Consume and next-generation insert happen in one transaction; `(family_id, ge...](../../rules/o/c/idn-13.md)
- [IDN-14 — The loser of concurrent refresh receives `invalid_grant`; idempotent grace re...](../../rules/o/c/idn-14.md)

