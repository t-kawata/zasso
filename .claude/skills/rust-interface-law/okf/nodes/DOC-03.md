---
type: Rule
id: DOC-03
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d540c2975ef8853a71f8690e708057a5783f89ccdb88bee49edc213b57982d6c
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `DOC-03` | C | docs | DOC | Part III.16 | The generator MUST consume a neutral schema registry, not parse Rust source. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
