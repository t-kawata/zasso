---
type: Rule
id: AUTH-19
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 4de15c5a3f05a50bb94351bca4d08e2e507f25620fb72cd61008196de4a2d2b5
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-19` | C | all | AUTH | Part II | Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`. | V3 test. | negative-auth suite |
