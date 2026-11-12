---
type: Rule
id: DOC-05
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 47d498b62ca514f2eb367c2a518624f70c547392d9dda4753422ea5c3c401107
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `DOC-05` | C | docs | DOC | Part III.16 | Interface-specific documentation MUST come from interface bindings, not be inferred from REST. | V3 test. | cargo run -p <project>-docgen -- --check all |
