---
type: Rule
id: CONF-16
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b1e6f68d1f81f70358eeecd4caf35fca99d6f132e47b38ca77496a4837d608f8
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-16` | P | conformance | CONF | Part III.12 | A session ticket creates a new binding; the ticket redemption deadline and connection expiry are distinct. | V3 test. | cargo test -p <project>-conformance |
