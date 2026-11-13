---
type: Rule
id: AUTHZ-05
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 19e5b1863b2c3df70822fb00b17db25f4e233be68acc845773e138ec2b5e6338
source: sources/15-RULE-REGISTRY.md
---
| `AUTHZ-05` | C | all | AUTHZ | Part II | A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied. | V3 test. | negative-auth suite |
