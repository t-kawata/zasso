---
type: CodeBlock
id: codeblock/22-identity-crates-7-refresh-tokens-and-sessions-7-1-schema/1/8a3b355891a5
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8a3b355891a5a4f2c1ad69411675daa15a0fe44542f189b8cffa800f5e92d1a4
source: sources/22-IDENTITY.md
---
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
