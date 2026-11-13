---
type: Rule
id: VAL-16
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 9bc0330d747f0c47e595de4b9825c95f8979ada000fa544fcf73c70d29fca770
source: sources/15-RULE-REGISTRY.md
---
| `VAL-16` | G | all | VAL | Part III.17 | Hand-written constraint lists are forbidden; documentation is generated from descriptors. | V2 scan; V3 test. | cargo test + docgen --check validation |
