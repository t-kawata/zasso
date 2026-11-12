---
type: Rule
id: OPS-13
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 8801465942510c2cb2d22106e4a865d11d020a0b5681d77a841933f051178869
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-13` | G | all | OPS | Part II | Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`. | V2 import scan. | cargo test -p <project>-operation/core |
