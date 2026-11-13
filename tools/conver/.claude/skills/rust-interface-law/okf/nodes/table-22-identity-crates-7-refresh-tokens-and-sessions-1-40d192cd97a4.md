---
type: Table
id: table/22-identity-crates-7-refresh-tokens-and-sessions/1/40d192cd97a4
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 40d192cd97a44fdc8c096ea74ec74338ae137a7522f9578a6a9ef9d78c7f3b40
source: sources/22-IDENTITY.md
---
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
