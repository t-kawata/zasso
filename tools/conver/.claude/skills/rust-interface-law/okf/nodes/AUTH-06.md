---
type: Rule
id: AUTH-06
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8dde6290c020cf98a92fb4ee6cffad5c4f3a91c64fc37ee29efc27495d8105fc
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-06` | C | all | AUTH | Part II | Tokens MUST contain `iss`, `sub`, `aud`, `exp`, `iat`, and `jti`. `nbf` and `scope` MAY be present. | V3 token test. | negative-auth suite |
