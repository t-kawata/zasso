---
type: Rule
id: OP-IDEM-03
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 96a5f6b5f21c392d14df79f297e4fff16a4734f811008ce3e077df69faecf1c8
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-IDEM-03` | C | all | OP-IDEM | Part III.4 | `same-transaction` stores the result in the business commit. | V3 crash test. | cargo test -p <project>-operation/core |
