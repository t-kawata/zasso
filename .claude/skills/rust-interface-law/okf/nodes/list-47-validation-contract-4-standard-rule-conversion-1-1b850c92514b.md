---
type: List
id: list/47-validation-contract-4-standard-rule-conversion/1/1b850c92514b
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 1b850c92514bd5cc98e3d45a1f3070d8cde19e5c74b504003df156cbd93d1d07
source: docs/archive/IMPLEMENTATION-SPEC/47-VALIDATION.md
---
- `pattern` is emitted as the schema `pattern` only when the expression is
  valid in the schema dialect (ECMA-262 for OpenAPI) and the runtime engine
  accepts the same expression.
- Otherwise the descriptor records `engine`, `expression`, and a human-readable
  description. The documentation shows the expression and the engine.
- A regex that is invalid or unsupported is a compile-time error.
