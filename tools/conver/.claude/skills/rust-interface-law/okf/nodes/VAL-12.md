---
type: Rule
id: VAL-12
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 00a2e81b3181d44846b7e0dbc7fae1b3b80979a51e358fae8bb2612552959fde
source: sources/15-RULE-REGISTRY.md
---
| `VAL-12` | G | all | VAL | Part III.17 | The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch. | V3 test. | cargo test + docgen --check validation |
