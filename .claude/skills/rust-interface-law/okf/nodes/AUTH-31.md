---
type: Rule
id: AUTH-31
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b1600f3a9ae5444f484e53533c362313edc6828a64264d409f90924a190dcee0
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-31` | C | all | AUTH | Part II | Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set. | V3 test. | negative-auth suite |
