---
type: List
id: list/90-migration-5-step-2-identity-crates/1/465fd8a80512
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 465fd8a805122d82863294647f3cafe0e4dd4e03dc064514d1d3dcc1220d19b1
source: sources/90-MIGRATION.md
---
1. Add `identity-jwt`, `identity-local`, and `identity-operation`.
2. Replace the existing JWT verifier with `AccessTokenVerifier`.
3. Replace the existing login endpoint with the `auth.token.issue` operation.
4. Replace ad-hoc principal types with `VerifiedIdentity`.
5. Add the negative JWT suite.
6. If SSO is planned, add the `identity-sso` placeholder crate but do not
   implement a provider yet.
