---
type: Rule
id: SSO-03
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 1aee16c0d7e5ed7d67f5389cc0711c063978d178a267db8ca858cd9915fd4112
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `SSO-03` | O/C | auth-sso | SSO | Part II | `state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use. | V3 test. | negative-auth suite |
