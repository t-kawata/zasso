---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-3-macro-contract-3-7-runtime-validation-path/3/e58bf2049b55
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: e58bf2049b55d464a32534c21c6757b7bcaccaa19e4aa9242827e28d352f52d1
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
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
