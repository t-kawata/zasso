---
type: Rule
id: OPS-07
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 53480b6b6b5ecf347e7e5b26186e86a7725ae603ad18e061285d7b0cb303d8b8
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-07` | C | all | OPS | Part II | Authorization MUST run inside the operation, not only in the adapter. | V3 bypass test. | cargo test -p <project>-operation/core |
