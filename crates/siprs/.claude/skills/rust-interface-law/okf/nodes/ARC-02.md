---
type: Rule
id: ARC-02
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d84a3e884b3da0476cf7c08f72a3597fe71733f58f04ab846e0ceccd6b3f0694
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ARC-02` | C | all | ARC | Part II | Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-* → identity-core`. | V2 `cargo metadata` edge check. | cargo metadata / check-deps |
