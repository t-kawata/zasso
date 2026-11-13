---
type: Rule
id: VAL-19
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3ca113ab3cfb0a037e01eebff84e236906ed74fbdb6f3d7c6ce84476a4b47821
source: sources/15-RULE-REGISTRY.md
---
| `VAL-19` | G | all | VAL | Part III.17 | Validation descriptors and generated documentation contain no secrets or sensitive examples. | V2 scan; V3 test. | cargo test + docgen --check validation |
