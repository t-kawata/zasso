---
type: Rule
id: OP-IDEM-09
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 6bdce108f3d1b6c46f81bb0854ea5ff95ec51dd158c7b47bf73f8bceef5a8bf5
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-IDEM-09` | C | all | OP-IDEM | Part III.4 | `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion. | V3 crash test. | cargo test -p <project>-operation/core |
