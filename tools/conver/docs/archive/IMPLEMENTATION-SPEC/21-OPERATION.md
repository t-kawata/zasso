# 21 — Operation Crate

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

---

## 1. Purpose

`*-operation` is the only place where business operations are implemented. It
registers authenticated and anonymous operations, implements authorization and
transaction boundaries, and enqueues outbox events. The dispatcher itself is a
shared contract implementation, not a project crate, so that it can construct
authenticated contexts and enforce credential binding.

---

## 2. Dependencies

```toml
[dependencies]
<project>-core = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
thiserror = { workspace = true }
# no axum, tonic, rmcp, a2a-*, clap, jsonwebtoken, oauth2
```

---

## 3. Layout

```text
*-operation/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # public registry, authorizer, unit-of-work
    ├── registry/
    │   ├── mod.rs
    │   └── register_all.rs     # generated
    ├── authz/
    │   ├── mod.rs
    │   ├── authorizer.rs       # project policy
    │   └── actions.rs          # open Action set
    ├── handlers/
    │   ├── mod.rs
    │   └── <domain>/
    │       ├── mod.rs
    │       └── <operation>.rs  # create-once skeleton + hand-written body
    ├── anonymous/
    │   ├── mod.rs
    │   └── auth_token_issue.rs # auth.token.issue
    ├── error/
    │   ├── mod.rs
    │   └── mapping.rs          # DomainError -> OperationError
    ├── uow/
    │   ├── mod.rs
    │   └── factory.rs          # UnitOfWorkFactory
    └── tests/
```

---

## 4. Dispatcher and Contexts

The dispatcher is provided by `operation-contract`. The project constructs it
with:

- `OperationRegistry` (authenticated and anonymous entries)
- `AccessTokenVerifier`
- `IdempotencyStore`
- `ResultStore`
- `RevocationChecker`
- `ClockFn`
- `DispatchLimits`

The dispatcher, not the project, constructs `AuthenticatedContext` and
`AnonymousContext`. It checks the credential binding, authentication
requirement, scope, deadline, revocation, generated input validation, and
idempotency. It also exposes the unary and streaming entry points; adapters
never call a handler directly.

```rust
let dispatcher = Dispatcher::new(
    Arc::new(registry),
    Arc::new(jwt_verifier),
    Arc::new(idempotency_store),
    Arc::new(result_store),
    Arc::new(revocation_checker),
    clock_fn,
    DispatchLimits { /* ... */ },
);
```

`execute_verified` rejects a `VerifiedIdentity` whose binding does not match the
requested interface, audience, or expiry. A project cannot bypass this check by
constructing a context.

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

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-VAL-01 | Every request type implements the generated `ContractValidate` and is validated before the idempotency claim. Replay uses `replay_authorize` and does not call `prepare`. | Order. | Macro expansion. | V3 test. |
| OP-VAL-02 | Handlers MUST NOT duplicate standard input validation that the macro already generates. | Single source. | Custom rule functions. | V2 scan; V4 review. |
| OP-VAL-03 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |

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

```rust
pub trait Authorizer: Send + Sync {
    fn require(
        &self,
        identity: &VerifiedIdentity,
        action: Action,
        target: &AuthorizationTarget,
    ) -> Result<(), AuthorizationError>;
}
```

`AuthorizationTarget` is `Resource`, `Tenant`, or `Global`. `prepare` loads the
resource and passes it to the authorizer. For create operations, the target is
the tenant or global; there is no fabricated resource.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-AUTH-01 | Scope is checked by the dispatcher; ownership/tenant by the authorizer. | Both. | Policy. | V3 test. |
| OP-AUTH-02 | The authorizer uses the loaded resource, never request IDs alone. | Resource target. | Policy. | V3 cross-tenant test. |
| OP-AUTH-03 | Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`. | Categories. | Detail. | V3 test. |
| OP-AUTH-04 | Replay is authorized through `replay_authorize` against the recorded target, not through full `prepare`. | Replay path. | — | V3 test. |
| OP-AUTH-05 | The same identity and resource produce the same result through every interface. | Invariant. | — | V3 conformance. |

---

## 8. Idempotency

The catalog declares one of:

- `none` — no idempotency;
- `same-transaction` — the idempotency record is part of the business unit of
  work;
- `external` — a leased external store with recovery.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-IDEM-01 | The namespace includes subject, tenant, and operation. | Namespace. | — | V3 test. |
| OP-IDEM-02 | `claim` is atomic; concurrent claims produce one `Acquired`. | Atomicity. | Store implementation. | V3 concurrency test. |
| OP-IDEM-03 | `same-transaction` stores the result in the business commit. | Transaction membership. | — | V3 crash test. |
| OP-IDEM-04 | `external` uses a lease and `recover_expired`. | Lease and recovery. | Lease duration. | V3 crash test. |
| OP-IDEM-05 | A replay calls `replay_authorize` against the recorded target and never re-runs `prepare`. | Replay path. | — | V3 test. |
| OP-IDEM-06 | Same key + different canonical request returns `conflict`. | Conflict rule. | Canonicalizer. | V3 test. |
| OP-IDEM-07 | Failed results are stored and replayed according to policy. | Policy declared. | Retry policy. | V3 test. |
| OP-IDEM-08 | A claim carries a generation and fencing token; `complete`, `fail`, and `renew` reject a stale owner. | Ownership proof. | Store implementation. | V3 test. |
| OP-IDEM-09 | `same-transaction` requires `ExecutionScope::complete` before `uow.commit`; the dispatcher verifies completion. | Atomic boundary. | — | V3 crash test. |
| OP-IDEM-10 | External side effects carry the fencing token or an equivalent deduplication/reconciliation key. | Dedup/reconcile. | Mechanism. | V3 test. |

---

## 9. Transactions, Outbox, and Recovery

```rust
pub trait ProjectUnitOfWork: UnitOfWork {
    fn accounts(&self) -> &dyn AccountRepository;
    fn calls(&self) -> &dyn CallRepository;
    // project-specific repository accessors
}

pub trait UnitOfWorkFactory: Send + Sync {
    fn begin(&self) -> BoxFuture<'_, Result<Box<dyn ProjectUnitOfWork>, DomainError>>;
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-TX-01 | Repositories come from the unit of work. | Ownership. | Concrete surface. | V2 scan; V3 test. |
| OP-TX-02 | Outbox intent is written in the same commit as the business mutation. | Atomic boundary. | Outbox implementation. | V3 crash test. |
| OP-TX-03 | Publication happens after commit by a relay. | Order. | Relay implementation. | V3 test. |
| OP-TX-04 | The relay retries and deduplicates by `event_id`. | Retry and dedup. | Backoff. | V3 test. |
| OP-TX-05 | Irreversible effects use forward recovery or isolation, not forced compensation. | Recovery declared. | Per-operation choice. | V3 failure-injection test. |
| OP-TX-06 | No unrelated external API wait occurs inside a database transaction. Database communication required by the transaction is allowed. External effects run outside the transaction or through outbox/forward recovery. | External-wait ban. | Transaction time budget. | V2 architecture scan; V3 test. |

The catalog records `recovery = compensate | forward | isolate` for every
operation that has external effects.

---

## 10. Events

`DomainEvent` carries `event_id`, `request_id`, `aggregate_id`, `revision`,
`occurred_at`, and payload. The handler enqueues it through the unit of work;
the relay publishes it after commit. A publication failure is retried; it never
rolls back a committed business change.

---

## 11. Errors

`error/mapping.rs` maps `DomainError` to `OperationError`. Every
`DomainErrorCode` has a mapping; an unknown code is a defect and fails the
build. Adapters receive `OperationErrorBody`; the internal `source` is never
serialized.

---

## 12. Registry

`register_all.rs` is generated from the catalog. It registers authenticated and
anonymous operations. Duplicate IDs are rejected at startup. A catalog entry
with no registration fails startup.

---

## 13. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, handler split, dispatcher ownership, pipeline order. | Operations, policies, transaction strategy. |
| Anonymous operation type and login operation ID. | Credential methods. |
| Idempotency namespace and claim semantics. | Idempotency store implementation. |
| UoW ownership of repositories and outbox. | Concrete repositories and outbox backend. |
| Recovery policy declaration. | Compensation / forward / repair implementation. |
| Error mapping coverage. | Error codes and messages. |
| Registry equality with the catalog. | Catalog contents. |

---

## 14. Conformance Obligations

1. Every catalog operation is registered exactly once.
2. Every authenticated operation has `prepare` that authorizes before mutation.
3. Every anonymous operation executes without a `VerifiedIdentity`.
4. Replay re-authorizes.
5. Concurrent idempotent claims produce one execution.
6. A crash after commit is recovered by the outbox/idempotency policy.
7. Irreversible effects follow the declared recovery policy.
8. No `InterfaceId` branching in operation code.
9. `cargo test -p <project>-operation` and `cargo clippy -p
   <project>-operation -- -D warnings`.
10. The conformance report names `OP-01` through `OP-12`, `OP-AUTH-01` through
    `OP-AUTH-05`, `OP-IDEM-01` through `OP-IDEM-10`, and `OP-TX-01` through
    `OP-TX-06`.
