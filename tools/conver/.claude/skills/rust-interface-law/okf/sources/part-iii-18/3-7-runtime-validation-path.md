---
type: "Section"
title: "3.7 Runtime Validation Path"
description: "`operation-contract` has a blanket erased wrapper. Validation is separate from"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/3-7-runtime-validation-path"
    title: "3.7 Runtime Validation Path"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/3-7-runtime-validation-path"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7725-7725"
---
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

