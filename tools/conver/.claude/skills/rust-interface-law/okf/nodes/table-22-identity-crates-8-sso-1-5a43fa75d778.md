---
type: Table
id: table/22-identity-crates-8-sso/1/5a43fa75d778
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 5a43fa75d77888e197243e144406d8473af6212d3032f97f32af23c390946d79
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
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
