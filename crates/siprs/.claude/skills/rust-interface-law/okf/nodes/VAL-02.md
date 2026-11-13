---
type: Rule
id: VAL-02
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8b5c97795de353a86c0c7826a1698fd650f81dd039eea518481a319b0c347ae2
source: sources/15-RULE-REGISTRY.md
---
| `VAL-02` | C | all | VAL | Part III.17 | The macro generates the runtime validator, schema, and descriptor from the same declaration. | V3 test. | cargo test + docgen --check validation |
