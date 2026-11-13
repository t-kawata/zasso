---
type: Rule
id: AUTH-14
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 4705ec90d047b4979109a55bf28f010d8e800fba97532f2e1cc3693319aab616
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-14` | C | all | AUTH | Part II | Revocation MUST be checked after signature validation, using `jti` and/or a user-level token version. Revocation checks MUST NOT replace cryptographic validation. | V3 test. | negative-auth suite |
