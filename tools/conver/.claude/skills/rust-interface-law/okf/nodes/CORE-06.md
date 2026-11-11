---
type: Rule
id: CORE-06
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 64780f24dc940e565de519cf7f9e53d76d38557cc8cea22ead24bd44636177f3
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CORE-06` | C | all | CORE | Part III.3 | Randomness and ID allocation go through `IdGenerator`. | V2 scan; V3 test. | cargo test -p <project>-operation/core |
