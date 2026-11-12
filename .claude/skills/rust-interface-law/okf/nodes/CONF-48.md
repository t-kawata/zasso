---
type: Rule
id: CONF-48
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d6769aec8436b204517af5ed94db95bbbf1ba7f61843e4d5643cae1d7fa16160
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-48` | P | conformance | CONF | Part III.12 | Same-transaction completion, business mutation, and outbox intent are atomic; a crash after commit recovers both the result and the event. | V3 crash test. | cargo test -p <project>-conformance |
