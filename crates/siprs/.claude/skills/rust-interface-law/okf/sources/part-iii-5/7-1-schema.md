---
type: "Section"
title: "7.1 Schema"
description: "```sql"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/7-1-schema"
    title: "7.1 Schema"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/7-1-schema"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3706-3706"
---
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

