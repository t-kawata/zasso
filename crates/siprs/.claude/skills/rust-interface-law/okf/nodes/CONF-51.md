---
type: Rule
id: CONF-51
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3316279445e8fce23da63418a7bd9817470dbd0481f58454e2de573180675520
source: sources/15-RULE-REGISTRY.md
---
| `CONF-51` | P | conformance | CONF | Part III.12 | Result lookup is authorized by the recorded subject, tenant, or an authorized operator; a bare request ID is insufficient. | V3 test. | cargo test -p <project>-conformance |
