---
type: Rule
id: AUTH-04
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0c2b0af393beea2026117b8271381ebab48632c97972071934b9f15fb3c02a73
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-04` | C | all | AUTH | Part II | The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile. | V2 config check; V3 negative test. | negative-auth suite |
