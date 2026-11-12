---
type: Table
id: table/47-validation-contract-6-runtime-execution/1/c07fbe3c21b9
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: c07fbe3c21b98c2b883fb08899b078e5b65b3a63a34aa9a7c706b75e9fd7bf93
source: docs/archive/IMPLEMENTATION-SPEC/47-VALIDATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-11 | Adapters do not implement interface-specific input validation. | Forbidden. | Conversion details. | V2 scan; V3 test. |
| VAL-12 | The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch. | Order. | Dispatch placement. | V3 test. |
| VAL-13 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |
| VAL-14 | The same input produces the same validation result through every interface. | Parity. | — | V3 conformance. |
