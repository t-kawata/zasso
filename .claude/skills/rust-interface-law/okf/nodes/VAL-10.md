---
type: Rule
id: VAL-10
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 5fb5f4ab941a93fdf42e196972f3667f9715330545c99ed3652b54a26d7dc977
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `VAL-10` | C | all | VAL | Part III.17 | The runtime and the descriptor use the same `check` function and `code`. | V3 test. | cargo test + docgen --check validation |
