# 22 — Identity Crates

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

---

## 1. Purpose

The identity crates own authentication. They answer: who is the subject, what
was verified, where, and until when? They do not own business authorization and
do not own interface credential extraction.

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

```text
identity-core/src/
  identity/{subject,verified,scope,audience,binding}.rs
  auth/{verifier,issuer,credentials,key_store,error}.rs
  jwt/{mod,claims,verifier,issuer,keys}.rs        # feature = "jwt"
  ticket/{mod,store}.rs                           # feature = "ticket"

identity-local/src/{lib,password}.rs
identity-operation/src/{lib,login,token_issue,external_identity}.rs
identity-sso/src/{lib,oidc,state}.rs
```

---

## 4. Token Profile

| Item | Value |
|---|---|
| Format | JWS compact. JWE is not used. |
| `typ` | `at+jwt` for access tokens; `id+jwt` for internal ID tokens. |
| `alg` | `EdDSA` default; `ES256` allowed. `none` and HS* rejected except `local-only`. |
| `kid` | Required. |
| Required claims | `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, `ver`. |
| Optional claims | `scope`, `nbf`, `tenant`, `act`, `on_behalf_of`. |
| `sub` | Internal `SubjectId`. Never an email or provider ID. |
| `aud` | One interface or resource. |
| `ver` | User token version; compared after signature validation. |
| Access TTL | 900 seconds (configurable 300–3600). |
| Leeway | 30 seconds (configurable 0–60). |
| Key URLs | `jku`/`x5u` never followed. JWKS URL fixed by configuration. |

### 4.1 Validation order

```text
alg allowlist
  → signature
  → iss
  → aud
  → exp / nbf
  → typ
  → sub
  → tenant / delegation
  → ver (token version)
  → jti revocation
```

A failure at any stage returns `AuthenticationError`. The interface maps it to
401; details are logged, never returned.

### 4.2 Claims

```rust
pub struct AccessClaims {
    pub iss: String,
    pub sub: SubjectId,
    pub aud: Audience,
    pub exp: i64,
    pub iat: i64,
    pub nbf: Option<i64>,
    pub jti: String,
    pub ver: u64,
    pub tenant: Option<TenantId>,
    pub scope: Vec<Scope>,
    pub act: Option<SubjectId>,
    pub on_behalf_of: Option<SubjectId>,
}
```

`AccessClaims` is not part of the public deserialization surface; only the
verifier constructs it.

### 4.3 Delegation

`sub` is the delegated subject, `act` is the actor. Validation MUST ensure:

- the actor is authorized to act for the subject;
- delegated scopes are a subset of both the actor's and the subject's scopes;
- `on_behalf_of` is explicit and is not inferred from `sub`;
- the `VerifiedIdentity` preserves `actor` and `on_behalf_of` for audit.

---

## 5. Keys

```rust
pub trait KeyStore: Send + Sync {
    fn public_key(&self, kid: &str, alg: Algorithm) -> Result<PublicKey, AuthenticationError>;
    fn active_kids(&self) -> Vec<String>;
}

pub trait SigningKeyStore: Send + Sync {
    fn signing_key(&self, kid: &str) -> Result<SigningKey, AuthenticationError>;
}
```

- Multiple active public keys are required for rotation.
- Private keys never leave `identity-core`.
- Key material is validated at startup; invalid keys fail startup.
- JWKS refresh uses a fixed URL and a fixed policy.
- Fail-closed on unknown `kid`, unsupported algorithm, or key parse failure.

---

## 6. Login and Local Identity

```rust
pub struct LoginService {
    verifiers: std::collections::BTreeMap<AuthMethod, std::sync::Arc<dyn ErasedCredentialVerifier>>,
    issuer: std::sync::Arc<dyn TokenIssuer>,
}

impl LoginService {
    pub async fn login(
        &self,
        method: AuthMethod,
        credential: serde_json::Value,
        audience: Audience,
    ) -> Result<TokenIssueResponse, AuthenticationError>;
}
```

`auth.token.issue` is an `AnonymousOperation` in `identity-operation`. It is
registered by the project operation crate.

For local CLI execution, the identity is established without an HTTP token:

```rust
pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &AuthenticatedUser,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<VerifiedIdentity>, AuthenticationError>;
}
```

The `LocalCredentialVerifier` returns `AuthenticatedUser`; the
`LocalIdentityIssuer` converts it into a `VerifiedIdentity` with a CLI binding.
There is no implicit administrator principal.

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

## 8. SSO

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| IDN-15 | SSO lives in `identity-sso`. | Crate boundary. | Provider set. | V2 dependency check. |
| IDN-16 | OIDC uses Authorization Code + PKCE S256. | Flow. | Provider config. | V3 test. |
| IDN-17 | `state` and `nonce` are per-request, session-bound, single-use. | Lifecycle. | Storage. | V3 test. |
| IDN-18 | Redirect URIs match exactly. | Validation. | Registered list. | V3 test. |
| IDN-19 | External `iss` is validated per provider. | Validation. | Provider map. | V3 test. |
| IDN-20 | External ID tokens are discarded after verification. | Forbidden forwarding. | — | V2 scan; V3 test. |
| IDN-21 | SSO output is `AuthenticatedUser`; `TokenIssuer` issues the internal token. | Flow. | Provider details. | V3 test. |
| IDN-22 | External accounts use `(issuer, subject)`. | Unique tuple. | — | V3 test. |
| IDN-23 | No automatic email-based linking. | Forbidden. | — | V3 test. |
| IDN-24 | Provider secrets come from configuration. | Config source. | — | V2 secret scan. |

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

## 10. Fixed and Open

| Fixed | Open |
|---|---|
| Crate boundaries and sealing. | Additional auth methods and SSO providers. |
| Binding fields: interface, audience, method, expiry, token version. | Claims beyond the required set. |
| Token format, validation order, TTL and leeway ranges. | Algorithm within the allowlist; key backend. |
| Audience separation and binding checks. | Audience values. |
| Login operation and single issuance path. | Credential methods. |
| Refresh atomic rotation and family revocation. | Grace window and store implementation. |
| Delegation validation. | Delegation policy details. |
| No secrets in logs, metrics, or errors. | Redaction implementation. |

---

## 11. Conformance Obligations

1. Negative authentication suite, including the expanded cases in §9.
2. Audience isolation between every pair of interfaces.
3. Binding mismatch rejection (interface, audience, expiry).
4. Local identity establishment without a token and without implicit admin.
5. Atomic refresh rotation, concurrent winner, reuse detection, family revoke.
6. Token version rejection.
7. Delegation validation.
8. SSO regression: existing operations, `VerifiedIdentity`, and business tables
   unchanged.
9. Redaction: no token, password, code, or verifier in logs or errors.
10. `cargo test -p identity-*` and `cargo clippy -p identity-* -- -D warnings`.
11. The conformance report names `IDN-07` through `IDN-24` and the negative
    cases.
