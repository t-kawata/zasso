---
type: Rule
id: SSO-05
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 173746de49d19d1d4210bcff4a33f94e6f9ff8b42cb8cf9c1f909fbc61a54948
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `SSO-05` | O/C | auth-sso | SSO | Part II | The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks. | V3 test. | negative-auth suite |
