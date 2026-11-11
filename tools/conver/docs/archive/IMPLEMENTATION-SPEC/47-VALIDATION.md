# 47 — Validation Contract

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2
**Documentation:** Part III.16

---

## 1. Purpose

Validation is declared once on the request type. The same declaration generates:

1. the runtime validator;
2. the schema used by `utoipa`/`schemars` and the neutral schema registry;
3. the machine-readable `ValidationDescriptor` consumed by documentation.

Validation and `#[schema(...)]` are not written twice. Documentation does not
infer constraints from implementation code.

The mandatory implementation method — macro expansion, runtime types,
`inventory` registration, docgen dumps, and gates — is Part III.18.

---

## 2. Declaration Syntax

```rust
#[contract::input]
#[derive(serde::Deserialize)]
pub struct CreateAccountRequest {
    #[rule(
        length(min = 3, max = 32, unit = "unicode_scalar"),
        pattern = "^[a-z][a-z0-9_]*$",
        code = "invalid_account_name"
    )]
    pub name: String,

    #[rule(
        range(min = 1, max = 100),
        code = "invalid_member_limit"
    )]
    pub member_limit: u32,

    #[rule(
        items(min = 1, max = 10),
        code = "invalid_tags"
    )]
    pub tags: Vec<String>,
}
```

`#[contract::input]` and `#[rule(...)]` are shared contract macros, not
`utoipa` APIs. The macro is owned by the shared `contract-macros` crate.

Custom, cross-field rules are attached to the type:

```rust
#[contract::input]
#[rule(custom(
    id = "date_range_order",
    check = validate_date_range,
    fields = ["start_at", "end_at"],
    description = "start_at must not be later than end_at.",
    code = "invalid_date_range"
))]
pub struct ExportRequest {
    pub start_at: i64,
    pub end_at: i64,
}

fn validate_date_range(value: &ExportRequest) -> Result<(), RuleViolation> {
    if value.start_at <= value.end_at {
        Ok(())
    } else {
        Err(RuleViolation::new())
    }
}
```

---

## 3. Generated Outputs

The type examples below are conceptual. The exact implementation types —
including const-friendly rule parameters, static slices, and `inventory`
registrations — are fixed in Part III.18.

`#[contract::input]` generates:

```rust
pub trait ContractValidate {
    fn validate(&self) -> Result<(), ValidationErrors>;
}

pub struct ValidationDescriptor {
    pub type_name: &'static str,
    pub fields: std::collections::BTreeMap<&'static str, FieldRules>,
    pub custom_rules: Vec<CustomRuleDescriptor>,
}

pub struct FieldRules {
    pub rules: Vec<RuleDescriptor>,
    pub error_code: Option<ErrorCode>,
}

pub struct RuleDescriptor {
    pub kind: RuleKind,
    pub parameters: serde_json::Value,
    pub error_code: ErrorCode,
    pub description: Option<&'static str>,
}

pub struct CustomRuleDescriptor {
    pub id: &'static str,
    pub fields: Vec<&'static str>,
    pub description: &'static str,
    pub error_code: ErrorCode,
    pub when: Option<&'static str>,
}
```

The macro emits:

- `impl ContractValidate for CreateAccountRequest`;
- schema attributes for the configured schema backend;
- `const VALIDATION: ValidationDescriptor` (or an equivalent accessor);
- a registration entry in the generated validation registry consumed by the
  documentation generator.

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

## 5. Custom Rules

Custom rules MUST carry:

| Field | Meaning |
|---|---|
| `id` | Stable rule identifier. |
| `check` | Rust validation function. |
| `fields` | Fields the rule observes. |
| `description` | English explanation used in documentation. |
| `code` | Stable error code. |
| `when` | Optional applicability condition, with an English description. |

A custom rule without a description is a definition error. The generator does
not invent a description from the function name or body.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-07 | Custom rules require `id`, `check`, `fields`, `description`, and `code`. | Required set. | Function body. | V1 macro check; V3 test. |
| VAL-08 | Conditional rules require `when` and an English condition description. | Required set. | Condition expression. | V1/V3. |
| VAL-09 | A custom rule without a description fails compilation. | Fail-closed. | — | V3 compile-fail test. |
| VAL-10 | The runtime and the descriptor use the same `check` function and `code`. | Single source. | — | V3 test. |

---

## 6. Runtime Execution

All interfaces use the same validator:

```text
REST / WS / CLI / gRPC / MCP / A2A
        ↓
typed request conversion (adapter)
        ↓
ContractValidate::validate() (generated, common operation path)
        ↓
idempotency claim
        ├─ replay → replay_authorize → stored result
        └─ acquired → prepare → execute
```

Generated validation is stateless input validation. State-dependent
preconditions, resource loading, and ownership authorization belong in
`prepare`, which is not called on replay.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-11 | Adapters do not implement interface-specific input validation. | Forbidden. | Conversion details. | V2 scan; V3 test. |
| VAL-12 | The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch. | Order. | Dispatch placement. | V3 test. |
| VAL-13 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |
| VAL-14 | The same input produces the same validation result through every interface. | Parity. | — | V3 conformance. |

---

## 7. Documentation

The documentation generator collects every `ValidationDescriptor` and combines
it with the operation catalog and interface bindings.

Outputs:

- REST: OpenAPI standard keywords and a rendered constraint table. Custom rules
  appear in the schema `description`; they are not hidden in a vendor extension.
- WebSocket: payload field constraints per operation.
- CLI: argument and flag constraints.
- gRPC: request message field constraints.
- MCP: tool input constraints.
- A2A: operation input constraints.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-15 | Every field rule appears in every applicable interface's documentation. | Coverage. | Presentation. | V3 completeness test. |
| VAL-16 | Hand-written constraint lists are forbidden; documentation is generated from descriptors. | Source of truth. | — | V2 scan; V3 test. |
| VAL-17 | Custom rules appear as readable English text in every interface reference, not only in an extension field. | Readability. | Formatting. | V3 test. |
| VAL-18 | Validation descriptions, messages, and examples are English-only. | Language. | — | V2 scan; V3 test. |
| VAL-19 | Validation descriptors and generated documentation contain no secrets or sensitive examples. | Secret-free. | — | V2 scan; V3 test. |
| VAL-20 | Generation is deterministic for the same descriptor set and version. | Determinism. | Renderer. | V3 digest test. |

---

## 8. Fixed and Open

| Fixed | Open |
|---|---|
| Single declaration; three outputs. | Macro implementation, crate name, and internal expansion. |
| Standard conversion table and no false mapping. | Schema backend selection (`utoipa` or `schemars`). |
| Required custom-rule fields. | Rule function body and condition expression. |
| Common runtime validator path. | Dispatch integration details. |
| Descriptor-driven documentation. | Renderer and presentation. |
| English-only and secret-free. | Message wording. |
| Fail-closed on unknown or incompatible rules. | Error text. |

---

## 9. Conformance Obligations

1. Every request type uses the shared input macro.
2. Every rule produces runtime validation, schema output, and a descriptor.
3. Standard rules match the conversion table; byte-length and non-ECMA regex
   rules are not mis-mapped.
4. Unknown or incompatible rules fail compilation.
5. Every custom rule has `id`, `check`, `fields`, `description`, and `code`.
6. The generated validator runs before business logic on every interface.
7. Validation parity holds across interfaces.
8. Every field rule appears in every applicable interface reference.
9. Documentation is English-only and secret-free.
10. Generation is deterministic.
11. The conformance report names `VAL-01` through `VAL-20` and `CONF-57`
    through `CONF-60`.
