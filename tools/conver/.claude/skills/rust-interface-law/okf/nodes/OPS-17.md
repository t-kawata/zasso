---
type: Rule
id: OPS-17
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 687f119d3cc2abb7f4a126887b7534b720a6b11d2b6c9991041ea74656c4c34d
source: sources/15-RULE-REGISTRY.md
---
| `OPS-17` | C | all | OPS | Part II | `ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it. | V1/V2 visibility; V3 test. | cargo test -p <project>-operation/core |
