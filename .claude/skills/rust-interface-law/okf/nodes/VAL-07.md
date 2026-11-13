---
type: Rule
id: VAL-07
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b4eef66da7438e142aa8bd66a330df1f0d2e0a96383492ae1cbc5a06c3f7a4f0
source: sources/15-RULE-REGISTRY.md
---
| `VAL-07` | C | all | VAL | Part III.17 | Custom rules require `id`, `check`, `fields`, `description`, and `code`. | V1 macro check; V3 test. | cargo test + docgen --check validation |
