---
type: "Section"
title: "4. Standard Rule Conversion"
description: "The neutral registry uses `schemars` as fixed in Part III.18. `utoipa` may be"
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "47-validation-4-standard-rule-conversion"
    title: "4. Standard Rule Conversion"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/47-VALIDATION.md"
x-source-span: "134-171"
---
## 4. Standard Rule Conversion

The neutral registry uses `schemars` as fixed in Part III.18. `utoipa` may be
used for REST rendering and is compared against the neutral schema; it is not
the authoritative source for other interfaces.

| Rule | Runtime check | Schema output |
|---|---|---|
| `range(min, max)` | inclusive numeric comparison | `minimum` / `maximum` |
| `range(gt, lt)` | exclusive numeric comparison | `exclusiveMinimum` / `exclusiveMaximum` |
| `length(min, max, unit="unicode_scalar")` | Unicode scalar count | `minLength` / `maxLength` |
| `length(..., unit="bytes")` | byte count | custom constraint plus description; never `minLength`/`maxLength` |
| `pattern` | regex according to the declared engine | `pattern` only when the expression is valid in the schema dialect |
| `items(min, max)` | element count | `minItems` / `maxItems` |
| `enum` | allowed variants | schema `enum` |

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-01 | Every request input constraint is declared once in `#[rule(...)]`. | Single declaration. | Rule set. | V2 scan; V3 test. |
| VAL-02 | The macro generates the runtime validator, schema, and descriptor from the same declaration. | Three outputs. | Macro implementation. | V3 test. |
| VAL-03 | Standard rules follow the conversion table in §4. | Table. | Schema backend. | V2 schema diff; V3 test. |
| VAL-04 | A rule whose unit or regex dialect does not match the schema keyword MUST be emitted as a custom constraint with an explicit description, not silently converted. | No false mapping. | Description text. | V3 test. |
| VAL-05 | Unknown rules and rules applied to an incompatible type MUST be compile-time errors. | Fail-closed. | Error text. | V3 compile-fail test. |
| VAL-06 | Every standard and custom rule carries an `error_code`. | Required field. | Code set. | V1/V3. |

Regex rules:

- `pattern` is emitted as the schema `pattern` only when the expression is
  valid in the schema dialect (ECMA-262 for OpenAPI) and the runtime engine
  accepts the same expression.
- Otherwise the descriptor records `engine`, `expression`, and a human-readable
  description. The documentation shows the expression and the engine.
- A regex that is invalid or unsupported is a compile-time error.

---

