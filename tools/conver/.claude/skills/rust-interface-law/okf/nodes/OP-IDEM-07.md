---
type: Rule
id: OP-IDEM-07
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 4bad567e720f787068a4e6c5ce43b2c0289ba26395804ce8dd5496c72f7ffc13
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-IDEM-07` | C | all | OP-IDEM | Part III.4 | Failed results are stored and replayed according to policy. | V3 test. | cargo test -p <project>-operation/core |
