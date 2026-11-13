---
type: Rule
id: CONF-56
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 1860bd90335ff038bd779b42caf164506404374c887e18fbc8135477780ac611
source: sources/15-RULE-REGISTRY.md
---
| `CONF-56` | P | conformance | CONF | Part III.12 | A project without the REST profile still generates documentation for its implemented interfaces. | V3 test. | cargo test -p <project>-conformance |
