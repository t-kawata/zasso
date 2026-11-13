---
type: Rule
id: DOC-10
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7c0d8900f82cf24f3e1ead3180ad56c86ab2bbc7a1d5de3f245c590e30dbcbc1
source: sources/15-RULE-REGISTRY.md
---
| `DOC-10` | C | docs | DOC | Part III.16 | A missing operation, interface, field, error category, auth statement, or example MUST fail the build. | V3 test. | cargo run -p <project>-docgen -- --check all |
