---
type: Rule
id: DOC-14
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 39a5ddf798abf4422980a34a4bc8a634df81d4e83d8c30ade3cfd97e4cf5828e
source: sources/15-RULE-REGISTRY.md
---
| `DOC-14` | C | docs | DOC | Part III.16 | Documentation MUST record `spec_version` and the input digest. | V3 test. | cargo run -p <project>-docgen -- --check all |
