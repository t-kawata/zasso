---
type: CodeBlock
id: codeblock/10-shared-contracts-6-idempotency/1/ae8d6550f6d5
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: ae8d6550f6d5672b22f9261f92d432e9e6e943d1262748a622cf4d12ee8d6b97
source: sources/10-CONTRACTS.md
---
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
