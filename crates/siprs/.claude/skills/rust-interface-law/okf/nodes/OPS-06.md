---
type: Rule
id: OPS-06
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: dd933dd3dbe2b425cefa37d6c01e3a2ceff3fa0b5b1ac7a2445658a9720a7dce
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-06` | C | all | OPS | Part II | No side effect MAY occur before authorization succeeds. | V3 failure-injection test. | cargo test -p <project>-operation/core |
