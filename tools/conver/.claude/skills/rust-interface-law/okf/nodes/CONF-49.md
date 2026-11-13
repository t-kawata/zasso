---
type: Rule
id: CONF-49
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 75d6ce94dbe38eb3fb7366372422aee937ece65e36ccc666b58a06ce3005310a
source: sources/15-RULE-REGISTRY.md
---
| `CONF-49` | P | conformance | CONF | Part III.12 | REST merges body context and header context, rejects conflicts, and returns `request_id` on success and on every failure path. | V3 test. | cargo test -p <project>-conformance |
