---
type: Table
id: table/22-identity-crates-10-fixed-and-open/1/f1e28b93734a
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: f1e28b93734afe0db3f0a320a3c135ce5d12fea3af7b10df86b49b535d62ddf3
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
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
