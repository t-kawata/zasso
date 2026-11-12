---
type: Rule
id: ARC-05
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 04e22a022ede4d526d3715dad472061f242cecd679c7bbbdbcde02942fc22f50
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ARC-05` | C | all | ARC | Part II | `*-conformance` MAY depend on every public boundary; no runtime crate may depend on `*-conformance`. | V2 `cargo metadata` edge check. | cargo metadata / check-deps |
