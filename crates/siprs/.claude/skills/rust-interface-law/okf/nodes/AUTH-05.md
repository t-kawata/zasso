---
type: Rule
id: AUTH-05
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 71d7036825499745fa42efa73b6a2dc2f8335557920fd8cb855689f601256bac
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-05` | C | all | AUTH | Part II | The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches. | V3 negative tests N-1, N-2, N-3. | negative-auth suite |
