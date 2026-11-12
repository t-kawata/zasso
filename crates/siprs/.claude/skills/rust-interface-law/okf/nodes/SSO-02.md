---
type: Rule
id: SSO-02
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0aab0a7764b1d8068ab244ae4f721eff77f91e0df1d08753ce3b13438aad0712
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `SSO-02` | O/C | auth-sso | SSO | Part II | OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden. | V3 protocol test. | negative-auth suite |
