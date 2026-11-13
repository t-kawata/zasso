---
type: CodeBlock
id: codeblock/22-identity-crates-7-refresh-tokens-and-sessions-7-2-atomic-rotation/1/8b01f9070d48
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8b01f9070d48554b83ea80204fb2090a8f5af65693fbdc81f41165607de8f6b7
source: sources/22-IDENTITY.md
---
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
