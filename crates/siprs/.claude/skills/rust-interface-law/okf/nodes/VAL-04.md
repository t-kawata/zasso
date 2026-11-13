---
type: Rule
id: VAL-04
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: fb1e5035dd161d4fc184ba45e48febdcb7ac28a6c3f25abf5bd3680a7075dcd0
source: sources/15-RULE-REGISTRY.md
---
| `VAL-04` | C | all | VAL | Part III.17 | A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted. | V3 test. | cargo test + docgen --check validation |
