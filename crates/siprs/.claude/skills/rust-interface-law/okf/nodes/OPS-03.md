---
type: Rule
id: OPS-03
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: cee2625700561907d6ae7d831517c80404e6ddac2e336d95545c0793deac7ca9
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-03` | C | all | OPS | Part II | `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease. | V1 type; V3 rejection test. | cargo test -p <project>-operation/core |
