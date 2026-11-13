---
type: Rule
id: CONF-34
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3c0674b47e3a84b7e7a5e4a2c739b5ab755e76a3d8a3521d3bd73971eb974851
source: sources/15-RULE-REGISTRY.md
---
| `CONF-34` | P | conformance | CONF | Part III.12 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | V3 test. | cargo test -p <project>-conformance |
