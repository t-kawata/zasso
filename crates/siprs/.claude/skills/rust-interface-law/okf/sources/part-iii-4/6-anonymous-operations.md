---
type: "Section"
title: "6. Anonymous Operations"
description: "`auth.token.issue` is an `AnonymousOperation`. It has no `VerifiedIdentity` and"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/6-anonymous-operations"
    title: "6. Anonymous Operations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/6-anonymous-operations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3317-3317"
---
## 6. Anonymous Operations

`auth.token.issue` is an `AnonymousOperation`. It has no `VerifiedIdentity` and
no implicit anonymous principal. It receives an `AnonymousContext` with a
request ID, interface, audience, and peer info.

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

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-09 | Anonymous operations are registered separately. | Registry variant. | Operation set. | V3 test. |
| OP-10 | No anonymous operation receives a `VerifiedIdentity`. | Type. | — | V1. |
| OP-11 | Anonymous operations do not bypass rate limits or validation. | Both required. | Limits and rules. | V3 test. |
| OP-12 | Idempotency for anonymous operations is opt-in and keyed by peer plus operation. | Namespace rule. | Policy. | V3 test. |

---

## 7. Authorization

## Rules in this section

- [OP-09 — Anonymous operations are registered separately.](../../rules/c/op-09.md)
- [OP-10 — No anonymous operation receives a `VerifiedIdentity`.](../../rules/c/op-10.md)
- [OP-11 — Anonymous operations do not bypass rate limits or validation.](../../rules/c/op-11.md)
- [OP-12 — Idempotency for anonymous operations is opt-in and keyed by peer plus operation.](../../rules/c/op-12.md)

