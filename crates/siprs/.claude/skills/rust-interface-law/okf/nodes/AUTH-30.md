---
type: Rule
id: AUTH-30
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 31b4b2894eaed508a2be08c31788c41e1aad4a40c365005391a6811069cb7164
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-30` | C | all | AUTH | Part II | A session ticket and a local identity issuer MUST create a new binding. A token or identity verified for one interface/audience MUST NOT be reused for another. | V3 test. | negative-auth suite |
