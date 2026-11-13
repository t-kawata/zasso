---
type: Rule
id: AUTH-20
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 278695b0f690eed4870928b20aaad5d51cf1e0df55a86ee199bd5bb74dcbf71f
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-20` | C | all | AUTH | Part II | HS256 is permitted only when all of the following hold: single process, no cross-interface token use, explicit `local-only` profile, key length ≥ 32 bytes. | V2 profile check; V3 negative test. | negative-auth suite |
