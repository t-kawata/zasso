---
type: Rule
id: OP-AUTH-02
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: f0d339b96939855acd9da613230e183d67ed7913f1f38bd62c1f43de5cc8a281
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-AUTH-02` | C | all | OP-AUTH | Part III.4 | The authorizer uses the loaded resource, never request IDs alone. | V3 cross-tenant test. | cargo test -p <project>-operation/core |
