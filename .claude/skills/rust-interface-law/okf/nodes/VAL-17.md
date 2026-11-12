---
type: Rule
id: VAL-17
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 204f5016767f3c3f1307b23c405f5c18fdbaeb731a06a54429223de34b48f567
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `VAL-17` | C | all | VAL | Part III.17 | Custom rules appear as readable English text in every interface reference, not only in an extension field. | V3 test. | cargo test + docgen --check validation |
