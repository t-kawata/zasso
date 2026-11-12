---
type: Rule
id: OP-TX-04
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c1db655e9fb39cbb535dddfcad4bc54b60618c1dbcc68c457c4e33399432a370
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-TX-04` | C | all | OP-TX | Part III.4 | The relay retries and deduplicates by `event_id`. | V3 test. | cargo test -p <project>-operation/core |
