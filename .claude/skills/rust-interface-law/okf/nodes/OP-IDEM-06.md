---
type: Rule
id: OP-IDEM-06
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 100070304e64ca40a4a1716eef7f670060825821a35cde8c2e8d85beb3ffda8f
source: sources/15-RULE-REGISTRY.md
---
| `OP-IDEM-06` | C | all | OP-IDEM | Part III.4 | Same key + different canonical request returns `conflict`. | V3 test. | cargo test -p <project>-operation/core |
