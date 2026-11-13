---
type: Rule
id: OP-IDEM-10
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c956b0f25e14bcbe9c1b522140d7eec60ff3511331288b296352af9802aabbed
source: sources/15-RULE-REGISTRY.md
---
| `OP-IDEM-10` | C | all | OP-IDEM | Part III.4 | External side effects carry the fencing token or an equivalent deduplication/reconciliation key. | V3 test. | cargo test -p <project>-operation/core |
