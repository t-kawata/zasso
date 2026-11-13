---
type: Rule
id: AUTHZ-01
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 5a7f9e92b7df700c8d09c20f497a7eea6b502877c50249181c2f0adc498cbbfc
source: sources/15-RULE-REGISTRY.md
---
| `AUTHZ-01` | C | all | AUTHZ | Part II | Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`. | V1 trait; V4 review. | negative-auth suite |
