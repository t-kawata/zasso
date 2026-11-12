---
type: Rule
id: CONF-27
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 019e1cd28037c94bd7914865eb9acb517a573ea9eb3ab01ab434433b75ee6772
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-27` | P | conformance | CONF | Part III.12 | A crash after business commit but before publication is recovered; the event is not lost. | V3 crash test. | cargo test -p <project>-conformance |
