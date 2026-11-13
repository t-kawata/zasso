---
type: Rule
id: AUTH-02
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 6122e6efb786ac91fb65eb7bd106d971cb8129cc3f2a7f05da70d246e26620b0
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-02` | C | all | AUTH | Part II | Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path. | V1 trait; V3 test. | negative-auth suite |
