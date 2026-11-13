---
type: Rule
id: VAL-11
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3cb0bfcb916cf70c044cd962828c443c599dc8c1c6ddab754c56a278ea84a5d9
source: sources/15-RULE-REGISTRY.md
---
| `VAL-11` | C | all | VAL | Part III.17 | Adapters do not implement interface-specific input validation. | V2 scan; V3 test. | cargo test + docgen --check validation |
