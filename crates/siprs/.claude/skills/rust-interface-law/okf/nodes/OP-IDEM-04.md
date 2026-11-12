---
type: Rule
id: OP-IDEM-04
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0cf8d9e566e331eafe1263da9efeec521623f09a507612bf96f3049121901dc6
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-IDEM-04` | C | all | OP-IDEM | Part III.4 | `external` uses a lease and `recover_expired`. | V3 crash test. | cargo test -p <project>-operation/core |
