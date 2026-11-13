---
type: Rule
id: OP-AUTH-04
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d357dd5e5f6f4e3150aa0116963c04bfc2aefb0afd0e9d26ce8f0f6ac5d54071
source: sources/15-RULE-REGISTRY.md
---
| `OP-AUTH-04` | C | all | OP-AUTH | Part III.4 | Replay is authorized through `replay_authorize` against the recorded target, not through full `prepare`. | V3 test. | cargo test -p <project>-operation/core |
