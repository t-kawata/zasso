---
type: "Section"
title: "4. Token Profile"
description: "| Item | Value |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-5/4-token-profile"
    title: "4. Token Profile"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-5/4-token-profile"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3564-3564"
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

