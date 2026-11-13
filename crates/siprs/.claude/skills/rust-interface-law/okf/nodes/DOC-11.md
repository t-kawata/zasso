---
type: Rule
id: DOC-11
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d8956992012b8bb58782d667d5631794f1d18e610c2470f691b0118c8bf30a68
source: sources/15-RULE-REGISTRY.md
---
| `DOC-11` | G | docs | DOC | Part III.16 | Generated documentation MUST be English-only; a non-English string fails the build. | V2 scan; V3 test. | cargo run -p <project>-docgen -- --check all |
