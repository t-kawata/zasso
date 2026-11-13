---
type: Rule
id: VAL-05
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: ed4633111e20df46ed63cdb368f6e682180f03460493169aa900620c03756780
source: sources/15-RULE-REGISTRY.md
---
| `VAL-05` | C | all | VAL | Part III.17 | Unknown rules and rules applied to an incompatible type MUST be compile-time errors. | V3 compile-fail test. | cargo test + docgen --check validation |
