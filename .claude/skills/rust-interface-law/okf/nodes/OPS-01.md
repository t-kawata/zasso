---
type: Rule
id: OPS-01
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 795bd2e4cc8d8617b679008eab1a57dde401c203530fae97ac5374a22a70f95a
source: sources/15-RULE-REGISTRY.md
---
| `OPS-01` | C | all | OPS | Part II | Every operation MUST have a stable `operation_id` and a typed request/response pair. | V1 types; V3 catalog test. | cargo test -p <project>-operation/core |
