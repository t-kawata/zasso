---
type: CodeBlock
id: codeblock/21-operation-crate-6-anonymous-operations/1/2e09aeb4147b
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2e09aeb4147b58e1b4e9d4cf419829b9bf05c8d1dba031d77aee21e96dfbee25
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
```rust
pub struct TokenIssue;

impl AnonymousOperation for TokenIssue {
    type Request = TokenIssueRequest;
    type Response = TokenIssueResponse;
    type Prepared = PreparedTokenIssue;
    const ID: OperationId = OperationId::new("auth.token.issue");

    fn prepare(
        &self,
        _ctx: &AnonymousContext,
        request: Self::Request,
    ) -> BoxFuture<'_, Result<Self::Prepared, OperationError>> {
        Box::pin(async move {
            validate_token_issue(&request)?;
            Ok(PreparedTokenIssue { request })
        })
    }

    fn execute(
        &self,
        _ctx: AnonymousContext,
        prepared: Self::Prepared,
    ) -> BoxFuture<'_, Result<Self::Response, OperationError>> {
        Box::pin(async move {
            self.login_service
                .login(prepared.request)
                .await
                .map_err(OperationError::from)
        })
    }
}
```
