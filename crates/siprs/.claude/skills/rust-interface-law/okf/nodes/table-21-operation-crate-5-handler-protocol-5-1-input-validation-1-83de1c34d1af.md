---
type: Table
id: table/21-operation-crate-5-handler-protocol-5-1-input-validation/1/83de1c34d1af
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 83de1c34d1afc13a7df3edfec9b1f60db8e784c9b787261168d82e71c5f37996
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-VAL-01 | Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`. | Order. | Macro expansion. | V3 test. |
| OP-VAL-02 | Handlers MUST NOT duplicate standard input validation that the macro already generates. | Single source. | Custom rule functions. | V2 scan; V4 review. |
| OP-VAL-03 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |
