---
type: "Section"
title: "5. Handler Protocol"
description: "Every authenticated handler implements `Operation` with `prepare` and"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/5-handler-protocol"
    title: "5. Handler Protocol"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/5-handler-protocol"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3232-3232"
---
## 5. Handler Protocol

Every authenticated handler implements `Operation` with `prepare` and
`execute`. The split is fixed:

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

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-01 | Exactly one handler per operation ID. | One registration. | Handler body. | V3 registry test. |
| OP-02 | `prepare` performs validation and authorization; it has no business side effect. | Split. | Validation and policy. | V3 failure-injection test. |
| OP-03 | `execute` performs reservation, mutation, commit, and outbox enqueue. | Order. | Transaction strategy. | V3 event-order test. |
| OP-04 | Repositories are obtained from the unit of work. | UoW ownership. | Concrete repository surface. | V2 scan; V3 test. |
| OP-05 | The handler never constructs `AuthenticatedContext` or `VerifiedIdentity`. | Opaque types. | — | V1; V3 compile-fail. |
| OP-06 | The handler does not branch on `InterfaceId`. | Forbidden. | — | V2 scan; V4 review. |
| OP-07 | A handler that cannot complete uses the declared recovery policy. | Recovery declared. | Compensate / forward / isolate. | V3 failure-injection test. |
| OP-08 | Generated skeletons carry a create-once marker and are not overwritten. | Marker. | Handler body. | V2 check. |

---

### 5.1 Input Validation

## Rules in this section

- [OP-01 — Exactly one handler per operation ID.](../../rules/c/op-01.md)
- [OP-02 — `prepare` performs validation and authorization; it has no business side effect.](../../rules/c/op-02.md)
- [OP-03 — `execute` performs reservation, mutation, commit, and outbox enqueue.](../../rules/c/op-03.md)
- [OP-04 — Repositories are obtained from the unit of work.](../../rules/c/op-04.md)
- [OP-05 — The handler never constructs `AuthenticatedContext` or `VerifiedIdentity`.](../../rules/c/op-05.md)
- [OP-06 — The handler does not branch on `InterfaceId`.](../../rules/c/op-06.md)
- [OP-07 — A handler that cannot complete uses the declared recovery policy.](../../rules/c/op-07.md)
- [OP-08 — Generated skeletons carry a create-once marker and are not overwritten.](../../rules/g/op-08.md)

