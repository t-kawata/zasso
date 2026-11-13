---
type: Rule
id: CONF-57
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 72c0662fd3b41fcae1887f12007bc7f0f2a023580bc5f244a83fccf20fecaf25
source: sources/15-RULE-REGISTRY.md
---
| `CONF-57` | P | conformance | CONF | Part III.12 | Every request uses the generated validator, and the same input produces the same validation result through every interface. | V3 test. | cargo test -p <project>-conformance |
