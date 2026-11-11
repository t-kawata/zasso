---
type: Rule
id: OPS-09
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b457d3496bfdaf89800b8b8ecbaefa0bd52906d6a19783bd262b2c9693b9f8b5
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-09` | C | all | OPS | Part II | Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict. | V3 test. | cargo test -p <project>-operation/core |
