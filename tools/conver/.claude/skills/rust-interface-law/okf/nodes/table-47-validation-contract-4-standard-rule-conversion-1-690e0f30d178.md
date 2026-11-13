---
type: Table
id: table/47-validation-contract-4-standard-rule-conversion/1/690e0f30d178
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 690e0f30d1788215888ebc437498e80a61a14a73d32d20a8e9a4a08ef4f50d04
source: sources/47-VALIDATION.md
---
| Rule | Runtime check | Schema output |
|---|---|---|
| `range(min, max)` | inclusive numeric comparison | `minimum` / `maximum` |
| `range(gt, lt)` | exclusive numeric comparison | `exclusiveMinimum` / `exclusiveMaximum` |
| `length(min, max, unit="unicode_scalar")` | Unicode scalar count | `minLength` / `maxLength` |
| `length(..., unit="bytes")` | byte count | custom constraint plus description; never `minLength`/`maxLength` |
| `pattern` | regex according to the declared engine | `pattern` only when the expression is valid in the schema dialect |
| `items(min, max)` | element count | `minItems` / `maxItems` |
| `enum` | allowed variants | schema `enum` |
