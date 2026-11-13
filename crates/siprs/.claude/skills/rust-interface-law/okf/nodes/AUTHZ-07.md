---
type: Rule
id: AUTHZ-07
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 251954bb449cf3b4b4d26532e96ecff55f2fa8b9db34626ad7572f97812f4ac1
source: sources/15-RULE-REGISTRY.md
---
| `AUTHZ-07` | C | all | AUTHZ | Part II | Authorization and mutation races MUST be handled with a transaction or a conditional update. | V3 race test. | negative-auth suite |
