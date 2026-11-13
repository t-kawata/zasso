---
type: Rule
id: DOC-13
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8df33e389470aa18fd57a0d20858ade8eb08726997a6861bea5da9672bb02a4d
source: sources/15-RULE-REGISTRY.md
---
| `DOC-13` | C | docs | DOC | Part III.16 | Documentation and examples MUST NOT contain secrets, tokens, or passwords. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
