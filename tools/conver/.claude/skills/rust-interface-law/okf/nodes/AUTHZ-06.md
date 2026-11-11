---
type: Rule
id: AUTHZ-06
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7ecfaa5f69503acf09887e84f8315853237a7d8e86a516ba6ae0bb93cbb9debe
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTHZ-06` | C | all | AUTHZ | Part II | Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation. | V2 string scan; V4 review. | negative-auth suite |
