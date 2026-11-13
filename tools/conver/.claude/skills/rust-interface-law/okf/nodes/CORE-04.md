---
type: Rule
id: CORE-04
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b389421fcc82c50cc344f9bca8e1b11339c470d85ed089d8ec963d213e5edea5
source: sources/15-RULE-REGISTRY.md
---
| `CORE-04` | C | all | CORE | Part III.3 | IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries. | V1. | cargo test -p <project>-operation/core |
