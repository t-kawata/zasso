---
type: Rule
id: OP-IDEM-02
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: f887fdaf614005caa9c7a7ee9846a90e42e8922c93b0fabb304be9ddc8eb052e
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-IDEM-02` | C | all | OP-IDEM | Part III.4 | `claim` is atomic; concurrent claims produce one `Acquired`. | V3 concurrency test. | cargo test -p <project>-operation/core |
