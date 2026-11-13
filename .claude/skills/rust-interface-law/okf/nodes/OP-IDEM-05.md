---
type: Rule
id: OP-IDEM-05
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 143d55cc6fee3ba5158da7d80225d2f951b7f171c215b44cd63c54a6731e75b7
source: sources/15-RULE-REGISTRY.md
---
| `OP-IDEM-05` | C | all | OP-IDEM | Part III.4 | A replay calls `replay_authorize` against the recorded target and never re-runs `prepare`. | V3 test. | cargo test -p <project>-operation/core |
