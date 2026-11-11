---
type: Rule
id: CONF-45
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b4640095b9c41a24e57009fffb4c4688d2d9ab614d462b9d15fd4300fd5a754c
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-45` | P | conformance | CONF | Part III.12 | A stream started through an adapter reaches the Dispatcher stream API and delivers items, EOF, and cancel. | V3 test. | cargo test -p <project>-conformance |
