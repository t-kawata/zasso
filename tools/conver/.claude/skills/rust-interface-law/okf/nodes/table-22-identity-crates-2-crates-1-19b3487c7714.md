---
type: Table
id: table/22-identity-crates-2-crates/1/19b3487c7714
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 19b3487c7714d273fa4d5d594eb43d41c569018ca8ff80a541e859e953e9146a
source: sources/22-IDENTITY.md
---
| Crate | Role | May depend on |
|---|---|---|
| `identity-core` | Identity types, `VerifiedIdentity`, `CredentialBinding`, auth traits, JWT and ticket implementations behind features. | Pure utility crates only. |
| `identity-jwt` | Facade re-exporting `identity_core::jwt`. | `identity-core`. |
| `identity-local` | Password and local credential verification. | `identity-core`. |
| `identity-operation` | Login orchestration, token issue operation, external identity resolution. | `identity-core`. |
| `identity-sso` | OIDC/SSO provider implementation. | `identity-core`. |
