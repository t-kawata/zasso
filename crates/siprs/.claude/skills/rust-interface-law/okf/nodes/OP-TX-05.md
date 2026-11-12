---
type: Rule
id: OP-TX-05
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 682ca6d12aa9e7cc9c5b96b7a6ab0b211f57f25359e84a05a55e1a20289ebd06
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-TX-05` | C | all | OP-TX | Part III.4 | Irreversible effects use forward recovery or isolation, not forced compensation. | V3 failure-injection test. | cargo test -p <project>-operation/core |
