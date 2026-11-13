---
type: Rule
id: SSO-04
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: cb78feef3f059d1da9a9e422f5627e02ecb65ed2fe728ac12cbf0b7cb2575b4a
source: sources/15-RULE-REGISTRY.md
---
| `SSO-04` | O/C | auth-sso | SSO | Part II | Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden. | V2 config check; V3 test. | negative-auth suite |
