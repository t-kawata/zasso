---
type: "Section"
title: "7. Refresh Tokens and Sessions"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/22-IDENTITY.md"
    id: "22-identity-7-refresh-tokens-and-sessions"
    title: "7. Refresh Tokens and Sessions"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/22-IDENTITY.md"
x-source-span: "182-287"
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

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  tenant_id     UUID,
  status        TEXT NOT NULL,
  token_version BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL
);

CREATE TABLE credentials (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  password_hash TEXT NOT NULL,
  updated_at    TIMESTAMP NOT NULL
);

CREATE TABLE external_identities (
  user_id       UUID NOT NULL REFERENCES users(id),
  issuer        TEXT NOT NULL,
  subject       TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE sessions (
  id                   UUID PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES users(id),
  family_id            UUID NOT NULL,
  generation           BIGINT NOT NULL,
  refresh_token_hash   TEXT NOT NULL,
  replaced_by_session  UUID,
  consumed_at          TIMESTAMP,
  grace_until          TIMESTAMP,
  revoked_at           TIMESTAMP,
  expires_at           TIMESTAMP NOT NULL,
  created_at           TIMESTAMP NOT NULL,
  UNIQUE (family_id, generation)
);

CREATE TABLE revoked_tokens (
  jti        TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL
);
```

### 7.2 Atomic rotation

Consumption and next-generation creation are one transaction.

```sql
BEGIN;

UPDATE sessions
SET consumed_at = now(),
    grace_until = now() + :grace
WHERE id = :session_id
  AND refresh_token_hash = :presented_hash
  AND consumed_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > now()
RETURNING id, user_id, family_id, generation;

-- Exactly one row is returned. If zero rows, roll back and follow the
-- reuse-or-invalid-grant path below.

INSERT INTO sessions (
  id, user_id, family_id, generation, refresh_token_hash, expires_at, created_at
) VALUES (
  :new_id, :user_id, :family_id, :generation + 1, :new_hash, :new_expiry, now()
);

UPDATE sessions
SET replaced_by_session = :new_id
WHERE id = :session_id;

COMMIT;
```

- The unique `(family_id, generation)` key prevents two next generations from
  being created for the same family.
- The loser of a concurrent refresh receives `invalid_grant` (recommended).
  If a project chooses idempotent grace instead, it MUST store the replacement
  token in an encrypted, short-lived cache; a hash alone cannot reproduce it.
  The project documents the threat model for that choice.
- A reuse after the grace window revokes the whole family.
- A token with `ver` below `users.token_version` is rejected even if the
  signature is valid.
- Family history rows are retained until the family expiry; revocation marks
  every non-consumed row in the family.

---

