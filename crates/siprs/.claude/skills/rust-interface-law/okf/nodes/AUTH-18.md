---
type: Rule
id: AUTH-18
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: bde015dfa3b49321969a8677d529b63c57018c6d9facc421f50e0c99d168a674
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-18` | C | all | AUTH | Part II | Login MUST be an operation (`auth.token.issue` or equivalent). It MUST NOT be a transport-specific router contract in `identity-core`. | V1 type; V2 import scan. | negative-auth suite |
