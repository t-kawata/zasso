---
type: Rule
id: CORE-01
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0b266bfd26bd5de413727396fb006ad23a3d325d6a629f7826e8e09eba9c8638
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CORE-01` | C | all | CORE | Part III.3 | Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt. | V1 types; V4 review. | cargo test -p <project>-operation/core |
