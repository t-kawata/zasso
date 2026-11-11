---
type: Rule
id: OP-VAL-01
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d87073b60fb3e8c28476deedba175c30cc12c51faded71dbe24579b95efe1f53
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-VAL-01` | G | all | OP-VAL | Part III.4 | Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`. | V3 test. | cargo test -p <project>-operation/core |
