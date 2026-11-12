---
type: Rule
id: ARC-06
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d2fe670f1ae20ad21cb4f458520b13fadcecb07790d6a142dbf7bb7885a09d36
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ARC-06` | C | all | ARC | Part II | Only the assembly/binary MAY depend on concrete authentication implementations (`identity-jwt`, `identity-local`, `identity-sso`) and wire them together. | V2 dependency check. | cargo metadata / check-deps |
