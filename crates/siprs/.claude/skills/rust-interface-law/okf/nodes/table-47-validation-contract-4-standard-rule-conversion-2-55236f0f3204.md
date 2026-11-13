---
type: Table
id: table/47-validation-contract-4-standard-rule-conversion/2/55236f0f3204
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 55236f0f3204d8ce1181b64fe5e050eb89157ab886b20d624cc90685190c5a4d
source: sources/47-VALIDATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-01 | Every request input constraint is declared once in `#[rule(...)]`. | Single declaration. | Rule set. | V2 scan; V3 test. |
| VAL-02 | The macro generates the runtime validator, schema, and descriptor from the same declaration. | Three outputs. | Macro implementation. | V3 test. |
| VAL-03 | Standard rules follow the conversion table in §4. | Table. | Schema backend. | V2 schema diff; V3 test. |
| VAL-04 | A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted. | No false mapping. | Description text. | V3 test. |
| VAL-05 | Unknown rules and rules applied to an incompatible type MUST be compile-time errors. | Fail-closed. | Error text. | V3 compile-fail test. |
| VAL-06 | Every standard and custom rule carries an `error_code`. | Required field. | Code set. | V1/V3. |
