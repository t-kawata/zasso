# 48 — Implementation Blueprint (Mandatory)

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2
**Validation:** Part III.17
**Documentation:** Part III.16

This document is the mandatory implementation method for validation and
documentation generation. A project MUST follow it, or declare a versioned
exception in `RULES-PROFILE.toml`. An implementer or AI agent must be able to
build the feature from this document without inventing the architecture.

---

## 1. Crates and Files

```text
crates/
├── contract-macros/                 # proc-macro crate
│   ├── Cargo.toml                   # syn 2, quote, proc-macro2
│   └── src/
│       ├── lib.rs                   # #[contract::input], #[rule]
│       ├── parse.rs                 # struct/field/rule parsing
│       ├── expand.rs                # ContractValidate + descriptor + schema
│       └── error.rs                 # syn::Error with spans
├── validation-contract/             # runtime crate
│   ├── Cargo.toml                   # inventory, schemars, serde
│   └── src/
│       ├── lib.rs
│       ├── validate.rs              # ContractValidate, ValidationErrors
│       ├── descriptor.rs            # ValidationDescriptor, RuleParams
│       ├── rules.rs                 # length/range/items/pattern/enum helpers
│       └── registry.rs              # inventory registrations
├── <project>-operation/
│   └── src/validation.rs            # ValidationErrors -> OperationError
└── <project>-docgen/
    ├── Cargo.toml                   # depends on <project>-operation
    └── src/
        ├── main.rs                  # subcommands
        ├── catalog.rs               # operation catalog loader
        ├── schema.rs                # schema registry loader
        ├── validation.rs            # validation registry loader
        ├── bindings.rs              # interface bindings
        ├── render/
        │   ├── rest.rs
        │   ├── websocket.rs
        │   ├── cli.rs
        │   ├── grpc.rs
        │   ├── mcp.rs
        │   └── a2a.rs
        └── check/
            ├── completeness.rs
            ├── english.rs
            ├── secrets.rs
            └── determinism.rs
```

`*-docgen` depends on `<project>-operation` so that `inventory` registrations
are linked into the binary. It does not start any server.

---

## 2. Runtime Types

```rust
// validation-contract
pub trait ContractValidate {
    fn validate(&self) -> Result<(), ValidationErrors>;
}

pub struct ValidationErrors {
    pub errors: Vec<ValidationError>,
}

pub struct ValidationError {
    pub field: &'static str,
    pub code: ErrorCode,
    pub message: String,
}

pub enum LengthUnit {
    UnicodeScalar,
    Bytes,
    Graphemes,
}

pub enum RegexEngine {
    Ecma262,
    RustRegex,
}

pub enum RuleParams {
    Length { min: u64, max: u64, unit: LengthUnit },
    Range { min: Option<&'static str>, max: Option<&'static str>, exclusive: bool },
    Items { min: u64, max: u64 },
    Pattern { expression: &'static str, engine: RegexEngine },
    Enum { variants: &'static [&'static str] },
    Custom { id: &'static str },
}

pub struct RuleDescriptor {
    pub kind: &'static str,
    pub params: RuleParams,
    pub error_code: ErrorCode,
    pub description: Option<&'static str>,
}

pub struct FieldDescriptor {
    pub field: &'static str,
    pub rules: &'static [RuleDescriptor],
    pub error_code: Option<ErrorCode>,
}

pub struct CustomRuleDescriptor {
    pub id: &'static str,
    pub fields: &'static [&'static str],
    pub description: &'static str,
    pub error_code: ErrorCode,
    pub when: Option<&'static str>,
}

pub struct ValidationDescriptor {
    pub type_name: &'static str,
    pub fields: &'static [FieldDescriptor],
    pub custom_rules: &'static [CustomRuleDescriptor],
}

pub struct ValidationRegistration {
    pub descriptor: &'static ValidationDescriptor,
}

pub struct SchemaRegistration {
    pub type_name: &'static str,
    pub schema: fn() -> schemars::Schema,
}

inventory::collect!(ValidationRegistration);
inventory::collect!(SchemaRegistration);

pub use inventory;
```

Numeric rule parameters are stored as string literals in the descriptor so the
descriptor can be a `const`/`static` value. The runtime check uses the parsed
Rust literal directly.

---

## 3. Macro Contract

### 3.1 Input

```rust
#[contract::input]
#[derive(serde::Deserialize, schemars::JsonSchema)]
pub struct CreateAccountRequest {
    #[rule(length(min = 3, max = 32, unit = "unicode_scalar"),
            pattern = "^[a-z][a-z0-9_]*$",
            code = "invalid_account_name")]
    pub name: String,
}
```

`#[contract::input]` is an attribute macro. `#[rule(...)]` and `#[rule(custom(...))]`
are consumed by it. The struct MUST derive `serde::Deserialize` and
`schemars::JsonSchema`; a missing derive is a compile error caused by the
generated `schemars::schema_for!` call.

### 3.2 Parse

1. Parse `syn::ItemStruct`.
2. For each field, read `#[rule(...)]`.
3. Reject a rule on an unsupported type.
4. For a custom rule, verify every name in `fields` exists on the struct.
5. Validate that `code` is a non-empty string literal.
6. Validate that `description` is non-empty and English-only for custom rules.

### 3.3 Supported Field Types

| Rust type | Allowed rules |
|---|---|
| `String`, `&str`, `Cow<'_, str>` | `length`, `pattern`, `enum`, `required` |
| `u8`..`u64`, `i8`..`i64`, `f32`, `f64` | `range`, `enum`, `required` |
| `Vec<T>` | `items`, `required` |
| `Option<T>` | inner rules with `inner(...)`; `required` applies to the option itself |
| other types | only `custom`, or an explicit `unsupported_type` compile error |

A standard rule on any other type is a compile error with the field span.

### 3.4 Emitted Code

For a struct `CreateAccountRequest`, the macro emits:

```rust
impl validation_contract::ContractValidate for CreateAccountRequest {
    fn validate(&self) -> Result<(), validation_contract::ValidationErrors> {
        let mut errors = Vec::new();

        if let Err(e) = validation_contract::rules::length(
            &self.name,
            3,
            32,
            validation_contract::LengthUnit::UnicodeScalar,
        ) {
            errors.push(validation_contract::ValidationError {
                field: "name",
                code: validation_contract::ErrorCode::new("invalid_account_name"),
                message: e.to_string(),
            });
        }

        if let Err(e) = validation_contract::rules::pattern(
            &self.name,
            "^[a-z][a-z0-9_]*$",
            validation_contract::RegexEngine::Ecma262,
        ) {
            errors.push(/* ... */);
        }

        // custom rules
        if let Err(_) = validate_date_range(self) {
            errors.push(/* id, fields, code, description */);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(validation_contract::ValidationErrors { errors })
        }
    }
}

const VALIDATION: validation_contract::ValidationDescriptor =
    validation_contract::ValidationDescriptor {
        type_name: "CreateAccountRequest",
        fields: &[
            validation_contract::FieldDescriptor {
                field: "name",
                rules: &[
                    validation_contract::RuleDescriptor {
                        kind: "length",
                        params: validation_contract::RuleParams::Length {
                            min: 3,
                            max: 32,
                            unit: validation_contract::LengthUnit::UnicodeScalar,
                        },
                        error_code: validation_contract::ErrorCode::new("invalid_account_name"),
                        description: Some("3 to 32 Unicode scalar values."),
                    },
                ],
                error_code: Some(validation_contract::ErrorCode::new("invalid_account_name")),
            },
        ],
        custom_rules: &[],
    };

validation_contract::inventory::submit! {
    validation_contract::ValidationRegistration {
        descriptor: &VALIDATION,
    }
}

validation_contract::inventory::submit! {
    validation_contract::SchemaRegistration {
        type_name: "CreateAccountRequest",
        schema: || schemars::schema_for!(CreateAccountRequest),
    }
}
```

### 3.5 Compile-Time Errors

The macro returns `syn::Error::new_spanned` for:

- unknown rule name;
- rule applied to an incompatible field type;
- missing or empty `code`;
- custom rule without `id`, `check`, `fields`, `description`, or `code`;
- custom rule naming a field that does not exist;
- conditional rule without `when` and an English description;
- non-English `description`;
- malformed literal (non-numeric range, invalid regex);
- duplicate rule kind on the same field.

No rule is silently ignored.

### 3.6 Schema Registration

The macro emits `schemars::schema_for!(Type)` through the inventory
registration. The docgen dump calls the function pointer; the schema is a
normal `schemars::Schema`.

If the project uses `utoipa` for REST, it MAY also derive `utoipa::ToSchema`.
The neutral `schemars` registry remains authoritative for all interfaces, and a
gate compares the OpenAPI schema against the neutral schema for the same type.

### 3.7 Runtime Validation Path

`operation-contract` has a blanket erased wrapper. Validation is separate from
business preparation:

```rust
impl<O: Operation> ErasedAuthenticatedOperation for O
where
    O::Request: validation_contract::ContractValidate,
{
    fn validate_json(
        &self,
        request: &serde_json::Value,
    ) -> Result<ErasedValidated, OperationError> {
        let request: O::Request = serde_json::from_value(request.clone())
            .map_err(OperationError::invalid_input_json)?;
        request.validate().map_err(validation_to_operation)?;
        Ok(ErasedValidated::new(request))
    }

    fn prepare_validated(
        &self,
        ctx: &AuthenticatedContext,
        validated: ErasedValidated,
    ) -> BoxFuture<'_, Result<ErasedPrepared, OperationError>> {
        Box::pin(async move {
            let request = validated.into_typed::<O::Request>()?;
            let prepared = self.prepare(ctx, request).await?;
            Ok(ErasedPrepared::new(prepared))
        })
    }
}
```

The dispatcher calls `validate_json` before the idempotency claim, for both the
replay and new branches:

```text
authenticate / scope / deadline
        ↓
validate_json (deserialize + generated input validation)
        ↓
idempotency claim
        ├─ replay → replay_authorize → stored result
        └─ acquired → prepare_validated → execute → commit/outbox → result
```

`prepare_validated` is called only on the acquired branch. A replay never calls
`prepare` or `prepare_validated`. State-dependent business preconditions,
resource loading, and ownership authorization belong in `prepare`, not in the
generated input validator; generated validation is stateless input validation.

`ErasedValidated::new` and `into_typed` are internal helpers of the shared
crate; they are not public contract methods.

`Operation::Request` MUST implement `ContractValidate`. The project operation
crate defines:

```rust
fn validation_to_operation(errors: ValidationErrors) -> OperationError {
    OperationError::invalid_input_many(
        errors.errors.into_iter().map(|e| FieldError {
            field: e.field.to_string(),
            code: e.code,
            message: e.message,
        }).collect(),
    )
}
```

No adapter calls `prepare`, `validate_json`, or `prepare_validated` directly;
all adapters go through the dispatcher.

---

## 4. Docgen Binary

### 4.1 Subcommands

```text
<project>-docgen dump-schema      --out target/schema/registry.json
<project>-docgen dump-validation  --out target/validation/registry.json
<project>-docgen render           --catalog contract/operation-catalog.toml --out docs/generated
<project>-docgen check all
```

### 4.2 Registry JSON

`dump-schema` output:

```json
{
  "types": [
    {
      "type_name": "CreateAccountRequest",
      "schema": { "$schema": "https://json-schema.org/draft/2020-12/schema" }
    }
  ]
}
```

`dump-validation` output:

```json
{
  "types": [
    {
      "type_name": "CreateAccountRequest",
      "fields": [
        {
          "field": "name",
          "error_code": "invalid_account_name",
          "rules": [
            {
              "kind": "length",
              "params": { "min": 3, "max": 32, "unit": "unicode_scalar" },
              "error_code": "invalid_account_name",
              "description": "3 to 32 Unicode scalar values."
            }
          ]
        }
      ],
      "custom_rules": []
    }
  ]
}
```

Both dumps sort types and fields by name and use LF line endings.

### 4.3 Render Steps

1. Read catalog and bindings.
2. Read both registry JSON files.
3. For each operation, resolve request/response schemas and validation
   descriptors.
4. For each implemented profile, render its reference and, for REST, the
   OpenAPI document.
5. Run `check all`.
6. Write outputs atomically: write to a temporary directory, then rename.

### 4.4 Check Implementations

| Check | Implementation |
|---|---|
| Completeness | Every catalog operation has request/response schema; every field has a schema property; every validation rule has a description; every implemented interface has a binding and a rendered section. |
| English | Scan prose fields (summaries, descriptions, rule descriptions, error messages, examples) for CJK Unified Ideographs, Hiragana, Katakana, and Hangul; reject. Code fences marked `non-english-example` are exempt. |
| Secrets | Reject `-----BEGIN`, `Bearer ` followed by 20+ characters, `sk-`, `AKIA`, `password=`, `secret=`, and configured secret patterns. |
| Determinism | Run render twice into two temporary directories; compare byte-for-byte. Sort maps; no timestamps, random values, absolute paths, or unordered iteration. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Missing or incomplete artifact |
| 2 | Invalid input/catalog/schema |
| 3 | English-only violation |
| 4 | Secret violation |
| 5 | Non-deterministic output |

---

## 5. CI Gates

```bash
cargo run -p <project>-docgen -- dump-schema --out target/schema/registry.json
cargo run -p <project>-docgen -- dump-validation --out target/validation/registry.json
cargo run -p <project>-docgen -- render --catalog contract/operation-catalog.toml --out docs/generated
cargo run -p <project>-docgen -- check all
cargo test -p <project>-conformance
```

A missing `docs/generated/` directory or a non-zero exit fails the build.

---

## 6. Mandatory Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| BP-01 | This blueprint is the mandatory implementation method for validation and documentation. An alternate method requires a versioned exception. | Method. | Tooling internals. | V4 review; V2 config check. |
| BP-02 | Every request type uses `#[contract::input]` and implements `ContractValidate`. | Requirement. | Field rules. | V1 bound; V3 test. |
| BP-03 | The macro emits the validator, descriptor, schema registration, and inventory entries described in §3. | Outputs. | Internal expansion. | V3 test. |
| BP-04 | `Operation::Request` has a `ContractValidate` bound. `validate_json` runs before the idempotency claim; `prepare_validated` runs only on the acquired branch; replay calls `replay_authorize` only. | Order. | Error text. | V1/V3. |
| BP-05 | `validation-contract` owns the runtime types and `inventory` registrations in §2. | Types. | Internal layout. | V2 check. |
| BP-06 | Rule parameters are const-friendly and serialized to the exact JSON format in §4.2. | Format. | Extra fields. | V3 schema test. |
| BP-07 | `*-docgen` provides the four subcommands in §4.1 and depends on the operation crate to link registrations. | CLI. | Internal modules. | V3 test. |
| BP-08 | The schema registry is authoritative for all interfaces; `utoipa` output is compared, not used as the only source. | Source. | REST rendering. | V3 diff test. |
| BP-09 | Completeness, English, secrets, and determinism checks follow §4.4 and the exit codes. | Checks. | Implementation. | V3 test. |
| BP-10 | Generated documentation is written atomically and sorted deterministically. | Determinism. | Temp strategy. | V3 test. |
| BP-11 | A missing operation/interface/field/rule/description fails the build. | Fail-closed. | Message. | V3 test. |
| BP-12 | Custom rules require `id`, `check`, `fields`, `description`, and `code`; conditional rules require `when`. | Required set. | Function body. | V1/V3. |
| BP-13 | Unknown or type-incompatible rules fail compilation with a span. | Fail-closed. | Error text. | V3 compile-fail test. |
| BP-14 | No adapter implements interface-specific input validation. | Forbidden. | Conversion. | V2 scan; V3 test. |
| BP-15 | Documentation is English-only; non-English prose fails the English check. | Language. | Exempt code examples. | V3 test. |
| BP-16 | Documentation and examples contain no secrets. | Secret-free. | Patterns. | V3 test. |
| BP-17 | Documentation records `spec_version` and input digests. | Metadata. | Format. | V3 test. |
| BP-18 | REST is not required for schema dump or docgen; a non-REST project uses the same subcommands. | Independence. | Build tooling. | V3 test. |
| BP-19 | Generated files carry the generated marker and are never hand-edited. | Boundary. | Marker syntax. | V2 scan. |
| BP-20 | A feature that cannot follow the blueprint requires an amendment to this document, not a project fork. | Governance. | Version. | V4 review. |

---

## 7. Fixed and Open

| Fixed | Open |
|---|---|
| Crate/file layout, macro contract, runtime types, registry format. | Internal macro implementation and helper naming. |
| `inventory` registration and dump subcommands. | Renderer templates and Markdown styling. |
| Validation path and error mapping. | Error message wording. |
| Completeness/English/secret/determinism checks and exit codes. | Check implementation details. |
| CI commands. | CI provider and scheduling. |
| No REST dependency. | Schema backend selection within the neutral registry. |

---

## 8. Implementer Checklist

1. Add `contract-macros` and `validation-contract`.
2. Add `#[contract::input]` to every request type; derive `schemars::JsonSchema`.
3. Add `ContractValidate` to the `Operation::Request` bound. Implement
   `validate_json` before the idempotency claim and `prepare_validated` only on
   the acquired branch; replay uses `replay_authorize` only.
4. Add `*-docgen` with the four subcommands and both inventory dumps.
5. Add the completeness, English, secret, and determinism checks.
6. Add the CI commands.
7. Run `--check all` and make it pass.
8. Do not hand-write constraint tables or infer rules from code.

A project that skips a step is non-compliant, even if its documentation looks
complete.

## 9. Implementation Contract Pipeline

The generator pipeline adds the implementation contract between source and adapter output.

```text
source docs -> rule registry -> manifest/lock/coverage -> OKF
effective policy -> template catalog -> template plan -> scaffold
implementation-check -> implementation report -> gate -> attest
```

The generator MUST use the admitted template and MUST record the template hash. The gate MUST reject a missing report, a missing test, a zero-test selection, a failed detector, or a law identity mismatch.
