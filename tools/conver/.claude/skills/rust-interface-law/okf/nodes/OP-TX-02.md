---
type: Rule
id: OP-TX-02
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: fafbe555f3c9f5aef8dc21697fc26add885785fae786d6c6a7f86d7560efac69
source: sources/15-RULE-REGISTRY.md
---
| `OP-TX-02` | C | all | OP-TX | Part III.4 | Outbox intent is written in the same commit as the business mutation. | V3 crash test. | cargo test -p <project>-operation/core |
