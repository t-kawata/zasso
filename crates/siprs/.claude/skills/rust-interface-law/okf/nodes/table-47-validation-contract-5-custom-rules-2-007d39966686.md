---
type: Table
id: table/47-validation-contract-5-custom-rules/2/007d39966686
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 007d3996668697cbf879a7f8d0b3977f8e12c02198396f7a966bf62e6ada1e75
source: sources/47-VALIDATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-07 | Custom rules require `id`, `check`, `fields`, `description`, and `code`. | Required set. | Function body. | V1 macro check; V3 test. |
| VAL-08 | Conditional rules require `when` and an English condition description. | Required set. | Condition expression. | V1/V3. |
| VAL-09 | A custom rule without a description fails compilation. | Fail-closed. | — | V3 compile-fail test. |
| VAL-10 | The runtime and the descriptor use the same `check` function and `code`. | Single source. | — | V3 test. |
