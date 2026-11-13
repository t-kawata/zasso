---
type: Rule
id: CONF-59
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d3835626dd53998c6b2e26b4fa182d354fd21bbe1b92ed18ff9414af0a383022
source: sources/15-RULE-REGISTRY.md
---
| `CONF-59` | P | conformance | CONF | Part III.12 | Every custom rule has `id`, `check`, `fields`, `description`, and `code`, and appears in every applicable interface reference. | V3 test. | cargo test -p <project>-conformance |
