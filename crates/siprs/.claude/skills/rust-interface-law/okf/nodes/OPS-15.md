---
type: Rule
id: OPS-15
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 1896f93823eedbb6fe300da8a5d4ee8b89e89466f107c94b94747885343bf7e0
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-15` | C | all | OPS | Part II | Every operation MUST publish domain events only after commit. | V3 test. | cargo test -p <project>-operation/core |
