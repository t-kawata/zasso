---
type: Rule
id: DOC-01
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3255b1b5949419723ba3631f6f3ea97f956fe90d4bf7c08423c2ac539acf42e4
source: sources/15-RULE-REGISTRY.md
---
| `DOC-01` | G | docs | DOC | Part III.16 | Every implemented interface MUST have generated usage documentation. | V2 artifact check; V3 test. | cargo run -p <project>-docgen -- --check all |
