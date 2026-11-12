---
type: Rule
id: OP-AUTH-03
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2b2120166a07954d88aacf88901c4a1998fcc8f46d0864085b28a5a0cc9b23b8
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OP-AUTH-03` | C | all | OP-AUTH | Part III.4 | Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`. | V3 test. | cargo test -p <project>-operation/core |
