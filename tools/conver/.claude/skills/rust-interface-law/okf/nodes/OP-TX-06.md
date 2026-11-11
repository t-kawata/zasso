---
type: Rule
id: OP-TX-06
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 4b267e51fe618dfc54d89ef893d52cd96acff05f4c24c732e1c37f51c4ccb025
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-TX-06` | C | all | OP-TX | Part III.4 | No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery. | V2 architecture scan; V3 test. | cargo test -p <project>-operation/core |
