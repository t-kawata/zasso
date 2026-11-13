---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-3-macro-contract-3-7-runtime-validation-path/1/03ae3028896f
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 03ae3028896fbae94b056fdd9b5b58d1f646dadcbafb4b059e3fee05d4e848c6
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
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
