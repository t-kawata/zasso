---
type: Rule
id: AUTH-17
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 587449432c38130ba24e369ddf5513f96d59465a8a1041b1d8e42aa6926e0005
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-17` | C | all | AUTH | Part II | Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics. | V2 log scan; V3 redaction test. | negative-auth suite |
