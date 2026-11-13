---
type: CodeBlock
id: codeblock/21-operation-crate-5-handler-protocol/1/6b1245c365ef
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 6b1245c365efe7d31654310090d307a52f8d903760183a59716c2d6bbd69ca6e
source: sources/21-OPERATION.md
---
```rust
pub struct AddAccount;

impl Operation for AddAccount {
    type Request = AddAccountRequest;
    type Response = AddAccountResponse;
    type Prepared = PreparedAddAccount;

    const ID: OperationId = OperationId::new("account.add");
    const SCOPE: Scope = Scope::new("control");
    const MODE: OperationMode = OperationMode::Unary;

    fn prepare(
        &self,
        ctx: &AuthenticatedContext,
        request: Self::Request,
    ) -> BoxFuture<'_, Result<Self::Prepared, OperationError>> {
        Box::pin(async move {
            // schema/domain validation, tenant resolution, authorization
            self.authorizer.require(
                ctx.identity(),
                Action::new("account.add"),
                &AuthorizationTarget::Tenant(ctx.tenant().ok_or_else(|| {
                    OperationError::invalid_input("tenant is required")
                })?),
            )?;
            Ok(PreparedAddAccount { request })
        })
    }

    fn execute(
        &self,
        ctx: AuthenticatedContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async move {
            let mut uow = self.uow.begin().await?;
            // mutation through repositories obtained from uow
            let response = AddAccountResponse { /* ... */ };

            // SameTransaction idempotency: the response is serialized and
            // completed inside the business transaction.
            ctx.execution().complete_response(
                ctx.invocation().request_id(),
                &response,
            )?;

            uow.outbox().enqueue(event)?;
            uow.commit().await?;
            Ok(response)
        })
    }
}
```
