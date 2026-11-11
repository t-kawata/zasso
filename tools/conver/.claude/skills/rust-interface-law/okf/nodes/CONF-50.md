---
type: Rule
id: CONF-50
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: a61d1c6a0d50cb6012939b7aa40d8f133e8af8fa9c33955f374fdb8f0d21d334
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-50` | P | conformance | CONF | Part III.12 | A long-lived WebSocket connection observes revocation within the configured maximum staleness. | V3 test. | cargo test -p <project>-conformance |
