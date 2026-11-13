---
type: Rule
id: AUTH-16
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7c2d47f388202eaebd3f0d8b5d06ad2536582dd22980830b88a7d26b2e259205
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-16` | C | all | AUTH | Part II | Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned. | V3 response test. | negative-auth suite |
