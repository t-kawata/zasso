---
type: Rule
id: CONF-13
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 25a9f4cafa5ca66318ed82ca86febca9214fbb5adcf66af70da631fa2b63c96d
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-13` | P | conformance | CONF | Part III.12 | Every required interface rejects a token for another audience. | V3 test. | cargo test -p <project>-conformance |
