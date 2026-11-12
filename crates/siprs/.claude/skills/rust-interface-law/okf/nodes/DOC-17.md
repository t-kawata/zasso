---
type: Rule
id: DOC-17
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 28860f863406ce83f876b68f8b21234ddbc5255ed443a6b2f49afbc962ac1705
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `DOC-17` | C | docs | DOC | Part III.16 | Custom validation rules MUST appear as readable English text in every applicable interface reference. | V3 test. | cargo run -p <project>-docgen -- --check all |
