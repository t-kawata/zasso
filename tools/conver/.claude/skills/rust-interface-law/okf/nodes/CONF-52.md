---
type: Rule
id: CONF-52
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: ed43c1858ea1585bfec7a992b624690793316c934d5c42d5f7d42acf29f785d0
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-52` | P | conformance | CONF | Part III.12 | Refresh consumes the current generation and creates the next generation in one transaction; family history and reuse behavior match the declared policy. | V3 test. | cargo test -p <project>-conformance |
