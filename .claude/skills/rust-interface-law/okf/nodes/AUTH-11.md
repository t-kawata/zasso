---
type: Rule
id: AUTH-11
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: cd567b2701282b8b8ee3c85764889c565c00ac49286cf0c21c90b8e4dc8319b0
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-11` | C | all | AUTH | Part II | Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration. | V3 negative test N-11. | negative-auth suite |
