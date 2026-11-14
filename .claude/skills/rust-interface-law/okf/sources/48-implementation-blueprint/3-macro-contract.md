---
type: "Section"
title: "3. Macro Contract"
description: "```rust"
sources: 
  - resource: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
    id: "48-implementation-blueprint-3-macro-contract"
    title: "3. Macro Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/48-IMPLEMENTATION-BLUEPRINT.md"
x-source-span: "151-373"
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

