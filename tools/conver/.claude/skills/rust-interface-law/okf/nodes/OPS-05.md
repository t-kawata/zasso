---
type: Rule
id: OPS-05
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 9a38f326ea61008a51b8af03aec1e8970f8ee9e00dd42da6f4258ce05df50eb7
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-05` | G | all | OPS | Part II | The execution pipeline MUST follow this order: decode/size → authenticate or establish anonymity → authentication requirement → scope → deadline/admission → generated input validation → idempotency claim → replay branch (`replay_authorize` then stored result) or acquire branch (`prepare` then execute) → commit/outbox → result/reply. | V3 instrumented pipeline test. | cargo test -p <project>-operation/core |
