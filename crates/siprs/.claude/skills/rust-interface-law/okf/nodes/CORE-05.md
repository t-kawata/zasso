---
type: Rule
id: CORE-05
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d6c509d68c45d55a0527061a7a0d4ca2f4b93032459182c328099b41b5d8a7d4
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CORE-05` | C | all | CORE | Part III.3 | Time is injected through `Clock`; `Utc::now()` is forbidden in core. | V2 scan; V3 test. | cargo test -p <project>-operation/core |
