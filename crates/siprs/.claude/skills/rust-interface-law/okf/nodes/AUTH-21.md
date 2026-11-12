---
type: Rule
id: AUTH-21
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0680823a7859d5621fad6010a30eb87f75ab2e8a809acfff9679ca2c8853ae32
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-21` | C | all | AUTH | Part II | REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401. | V3 test. | negative-auth suite |
