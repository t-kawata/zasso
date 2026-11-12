---
type: Rule
id: DOC-16
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: ace94a3d311eabfe37b6639071b22c71f8303badc1fb28aeed0e44e96c6f5dc9
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `DOC-16` | C | docs | DOC | Part III.16 | Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
