---
type: Rule
id: SSO-06
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c024a3211192379c58693e97d208395f5f373eb02e9c310df5fb506e1d15c63c
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `SSO-06` | O/C | auth-sso | SSO | Part II | The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer. | V2 import scan; V3 test. | negative-auth suite |
