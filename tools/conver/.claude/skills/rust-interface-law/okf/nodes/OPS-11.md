---
type: Rule
id: OPS-11
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 11fbb492413e28f64ab2632018390f9935fe7754ad0b9fee6353e13d646f6df0
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-11` | C | all | OPS | Part II | Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics. | V3 streaming test. | cargo test -p <project>-operation/core |
