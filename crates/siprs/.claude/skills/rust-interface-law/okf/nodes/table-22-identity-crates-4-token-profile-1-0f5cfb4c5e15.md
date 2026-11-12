---
type: Table
id: table/22-identity-crates-4-token-profile/1/0f5cfb4c5e15
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 0f5cfb4c5e15fd2b6c7f4c488fbadf767a0fd4ee07141ced1aca17aecb0460f6
source: docs/archive/IMPLEMENTATION-SPEC/22-IDENTITY.md
---
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
