---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-3-macro-contract-3-4-emitted-code/1/96154e095e85
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 96154e095e85e38f9987bcfa03761ff1f2d5130f8876073f727b87526519d83b
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
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
