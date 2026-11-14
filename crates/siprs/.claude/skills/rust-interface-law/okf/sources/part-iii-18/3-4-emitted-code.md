---
type: "Section"
title: "3.4 Emitted Code"
description: "For a struct `CreateAccountRequest`, the macro emits:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/3-4-emitted-code"
    title: "3.4 Emitted Code"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/3-4-emitted-code"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7618-7618"
---
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

