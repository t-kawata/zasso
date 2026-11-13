---
type: Rule
id: AUTH-13
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 991536ad64dcf43770abf2aada2b18c3def8098a687392b31167a017b3131aee
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-13` | C | all | AUTH | Part II | Access tokens, ID tokens, and other token types MUST be mutually exclusive by `typ`, required claims, key, and audience. An external ID token MUST NOT be accepted as an access token. | V3 negative test N-9. | negative-auth suite |
