---
type: Rule
id: OPS-18
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7c2cf16277ffa5296ff475efc9ed9ec5e755136559a4a54f75a68176c64c57b5
source: sources/15-RULE-REGISTRY.md
---
| `OPS-18` | G | all | OPS | Part II | The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic. | V3 test. | cargo test -p <project>-operation/core |
