---
type: Rule
id: DOC-08
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0bba15b9563ed584724ece9a47ad6724a4c91e57425bd2aafa79a04b11a91b39
source: sources/15-RULE-REGISTRY.md
---
| `DOC-08` | C | docs | DOC | Part III.16 | Every implemented interface MUST have a reference section for every applicable operation. | V3 matrix test. | cargo run -p <project>-docgen -- --check all |
