---
type: Rule
id: OPS-10
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 97a37e6f8a0d1ec4242792cb28c16cc4b61b7bb7bb5872a57b395ac718373623
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-10` | C | all | OPS | Part II | Mutations that touch multiple resources MUST use a transaction or a compensating action. | V3 failure-injection test. | cargo test -p <project>-operation/core |
