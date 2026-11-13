---
type: Rule
id: OP-IDEM-08
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 28b7f7c31ce271e3cb60b89a4d89f826fa7852f51e8d2818890f8490e688c2cd
source: sources/15-RULE-REGISTRY.md
---
| `OP-IDEM-08` | G | all | OP-IDEM | Part III.4 | A claim carries a generation and fencing token; `complete`, `fail`, and `renew` reject a stale owner. | V3 test. | cargo test -p <project>-operation/core |
