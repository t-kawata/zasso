---
type: Rule
id: OP-VAL-02
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: cf6d4be0673b83ee3f805ea5dc7acb0a61730d7c12556ff72d9b2699ab875a1b
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-VAL-02` | C | all | OP-VAL | Part III.4 | Handlers MUST NOT duplicate standard input validation that the macro already generates. | V2 scan; V4 review. | cargo test -p <project>-operation/core |
