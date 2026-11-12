---
type: Rule
id: OPS-04
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b99917535a24924c23ab985a3a2ca54de781ea03beb01c97d103541d480e2431
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-04` | G | all | OPS | Part II | `request_id` MUST be generated when absent and MUST be stable across retries of the same logical request. | V3 test. | cargo test -p <project>-operation/core |
