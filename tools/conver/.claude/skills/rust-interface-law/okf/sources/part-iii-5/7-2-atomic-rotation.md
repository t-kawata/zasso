---
type: "Section"
title: "7.2 Atomic rotation"
description: "Consumption and next-generation creation are one transaction."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/7-2-atomic-rotation"
    title: "7.2 Atomic rotation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/7-2-atomic-rotation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3752-3752"
---
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

## 8. SSO

