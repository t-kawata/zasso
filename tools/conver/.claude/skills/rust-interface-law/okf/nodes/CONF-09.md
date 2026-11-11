---
type: Rule
id: CONF-09
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: f61fc3704517661f8b92568063f00f4b621046162b1c22c582caa78aedb86444
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-09` | P | conformance | CONF | Part III.12 | A mutation case must assert the resulting state, not only the response. | V3 test. | cargo test -p <project>-conformance |
