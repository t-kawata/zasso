---
type: Rule
id: VAL-01
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0a33bfc31cbd12a6c1f56256a0e8ed0dce811180eab252257bfd2e646a3d8662
source: sources/15-RULE-REGISTRY.md
---
| `VAL-01` | C | all | VAL | Part III.17 | Every request input constraint is declared once in `#[rule(...)]`. | V2 scan; V3 test. | cargo test + docgen --check validation |
