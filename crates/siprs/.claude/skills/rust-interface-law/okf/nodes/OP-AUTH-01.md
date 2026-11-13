---
type: Rule
id: OP-AUTH-01
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c83f4422ac732c96b258691f6c47876dde06af16e3ae2b8bb624bdaed89cfb28
source: sources/15-RULE-REGISTRY.md
---
| `OP-AUTH-01` | C | all | OP-AUTH | Part III.4 | Scope is checked by the dispatcher; ownership/tenant by the authorizer. | V3 test. | cargo test -p <project>-operation/core |
