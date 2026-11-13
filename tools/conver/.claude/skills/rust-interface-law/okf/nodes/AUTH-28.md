---
type: Rule
id: AUTH-28
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 17ca4d414752e45170da8edd7493857b639c50958c9e1322a6a99edca346112c
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-28` | C | all | AUTH | Part II | Authentication requirement (`Required`/`Anonymous`) MUST be separate from scope. Anonymous operations use `AnonymousOperation` and never receive a `VerifiedIdentity`. | V1 type; V3 test. | negative-auth suite |
