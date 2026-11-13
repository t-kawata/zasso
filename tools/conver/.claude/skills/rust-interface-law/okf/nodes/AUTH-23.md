---
type: Rule
id: AUTH-23
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 1c6ca618c228252bee9878884632f8b70c27ee76f69916451701904f119ea2e0
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-23` | C | all | AUTH | Part II | gRPC MUST read credentials from metadata and map auth failures to `UNAUTHENTICATED` or `PERMISSION_DENIED`. | V3 test. | negative-auth suite |
