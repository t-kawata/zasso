---
type: Rule
id: OP-VAL-03
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 54867ddde612f5c0ac16c74a7ed2dc42600d2866027266730d0e7295280d6639
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-VAL-03` | C | all | OP-VAL | Part III.4 | Validation failures map to `invalid_input` with field, code, and English message. | V3 test. | cargo test -p <project>-operation/core |
