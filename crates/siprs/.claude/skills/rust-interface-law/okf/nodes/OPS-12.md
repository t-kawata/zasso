---
type: Rule
id: OPS-12
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 560d9a4f8799aebe27c5446d0a11c5005c89d99dc72ae76ebdbeefcd423d3ade
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-12` | C | all | OPS | Part II | One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden. | V2 import/scan; V4 review. | cargo test -p <project>-operation/core |
