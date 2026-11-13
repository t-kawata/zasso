---
type: Rule
id: AUTHZ-04
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 5e96f90355dbe5ed9c637bca0a763165c58f477938b030823e1b3b980c456e79
source: sources/15-RULE-REGISTRY.md
---
| `AUTHZ-04` | C | all | AUTHZ | Part II | Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express "maybe anonymous". | V1 type; V3 test. | negative-auth suite |
