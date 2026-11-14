---
type: "Section"
title: "6. Idempotency"
description: "Idempotency is namespaced by authenticated subject, tenant, and operation. A key"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-6-idempotency"
    title: "6. Idempotency"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "1044-1178"
---
## 6. Idempotency

Idempotency is namespaced by authenticated subject, tenant, and operation. A key
alone is not a global namespace. Every claim carries an ownership handle and a
fencing generation so that an expired worker cannot commit after a new owner has
acquired the work.

```rust
pub struct IdempotencyNamespace {
    pub subject: Option<SubjectId>,
    pub tenant: Option<TenantId>,
    pub operation: OperationId,
}

pub enum IdempotencyMode {
    None,
    SameTransaction,
    External,
}

pub enum IdempotencyState {
    InFlight,
    Completed,
    Failed,
}

pub struct IdempotencyRecord {
    pub namespace: IdempotencyNamespace,
    pub key: IdempotencyKey,
    pub request_hash: [u8; 32],
    pub state: IdempotencyState,
    pub result: Option<OperationResultBody>,
    pub target: AuthorizationTargetSnapshot,
    pub owner: Option<SubjectId>,
    pub generation: u64,
    pub fencing_token: u64,
    pub lease_until: std::time::SystemTime,
}

#[derive(Clone)]
pub struct ClaimToken {
    pub namespace: IdempotencyNamespace,
    pub key: IdempotencyKey,
    pub generation: u64,
    pub fencing_token: u64,
}

pub enum ClaimOutcome {
    Acquired(ClaimToken),
    InFlight,
    Replay(ReplayRecord),
    Conflict,
}

pub trait IdempotencyStore: Send + Sync {
    fn claim(
        &self,
        namespace: &IdempotencyNamespace,
        key: &IdempotencyKey,
        request_hash: [u8; 32],
        target: AuthorizationTargetSnapshot,
        lease: std::time::Duration,
    ) -> BoxFuture<'_, Result<ClaimOutcome, OperationError>>;

    fn renew(
        &self,
        token: &ClaimToken,
        lease: std::time::Duration,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn complete(
        &self,
        token: &ClaimToken,
        result: &OperationResultBody,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn fail(
        &self,
        token: &ClaimToken,
        error: &OperationErrorBody,
    ) -> BoxFuture<'_, Result<(), OperationError>>;

    fn recover_expired(
        &self,
        now: std::time::SystemTime,
    ) -> BoxFuture<'_, Result<usize, OperationError>>;
}

pub struct ExecutionScope {
    claim: Option<ClaimToken>,
    store: Option<std::sync::Arc<dyn IdempotencyStore>>,
    completed: std::sync::atomic::AtomicBool,
}

impl ExecutionScope {
    pub fn complete(&self, result: &OperationResultBody) -> Result<(), OperationError>;
    pub fn complete_response<T: serde::Serialize>(
        &self,
        request_id: RequestId,
        response: &T,
    ) -> Result<(), OperationError>;
    pub fn fail(&self, error: &OperationErrorBody) -> Result<(), OperationError>;
    pub fn is_completed(&self) -> bool;
}
```

Rules:

- `claim` is atomic. Concurrent claims for the same namespace and key produce
  exactly one `Acquired`; the others receive `InFlight`, `Replay`, or
  `Conflict`.
- `ClaimToken` is the ownership proof. `complete`, `fail`, and `renew` MUST
  reject a stale generation or fencing token. An expired worker that resumes
  after a new owner acquired the work MUST NOT commit a side effect or a
  result.
- `SameTransaction` mode: the dispatcher gives the handler an
  `ExecutionScope` backed by the transaction-bound store. The handler MUST call
  `scope.complete` or `scope.fail` before `uow.commit`. The dispatcher verifies
  `scope.is_completed()`; a handler that commits without completing is a
  protocol violation.
- `External` mode: the dispatcher completes after `execute` and renews the
  lease while the operation is running. A crash after business commit but
  before result storage is recovered by `recover_expired` and the operation's
  declared recovery policy.
- Replay MUST call `Operation::replay_authorize` against the recorded
  `AuthorizationTargetSnapshot`. It MUST NOT re-run `prepare`; delete,
  create, and approve operations would otherwise reject a legitimate retry
  after their own first success.
- External side effects MUST carry the fencing token or provide an equivalent
  deduplication/reconciliation mechanism.
- The request hash uses canonical JSON (RFC 8785 JCS or a declared
  project-equivalent canonicalizer).

---

