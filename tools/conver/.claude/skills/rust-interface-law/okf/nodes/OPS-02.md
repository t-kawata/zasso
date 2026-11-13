---
type: Rule
id: OPS-02
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3ffc0706591e81921cd8051e732185232f63d7ead6014ef59a99cc265da6f70f
source: sources/15-RULE-REGISTRY.md
---
| `OPS-02` | C | all | OPS | Part II | The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`. | V3 schema test. | cargo test -p <project>-operation/core |
