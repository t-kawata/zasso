---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-8-errors/1/d32e35f58ed1
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d32e35f58ed103eafde9df0e632cec4bcad69cb064ad5b116c92cb4aba999480
source: sources/10-CONTRACTS.md
---
```rust
pub struct OperationError {
    pub code: ErrorCode,
    pub domain: ErrorDomain,
    pub retryable: bool,
    pub details: Option<serde_json::Value>,
    pub source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

#[derive(Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OperationErrorBody {
    pub code: ErrorCode,
    pub domain: ErrorDomain,
    pub retryable: bool,
    pub details: Option<serde_json::Value>,
}

impl OperationError {
    pub fn unsupported(message: &'static str) -> Self;
    pub fn category(&self) -> ErrorCategory;
    pub fn to_body(&self) -> OperationErrorBody;
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorCategory {
    InvalidInput,
    InvalidConfig,
    Unauthenticated,
    PermissionDenied,
    NotFound,
    AlreadyExists,
    InvalidState,
    Conflict,
    ResourceExhausted,
    Unsupported,
    Timeout,
    Cancelled,
    Unavailable,
    Internal,
}

pub struct ContractError(pub &'static str);

pub struct PublishError {
    pub retryable: bool,
    pub message: String,
}

pub type ClockFn = std::sync::Arc<dyn Fn() -> std::time::SystemTime + Send + Sync>;

#[derive(Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OperationResultBody {
    pub request_id: RequestId,
    pub result: Option<serde_json::Value>,
    pub error: Option<OperationErrorBody>,
}

impl OperationResultBody {
    pub fn success(request_id: RequestId, result: serde_json::Value) -> Self;
    pub fn failure(request_id: RequestId, error: OperationErrorBody) -> Self;
}

pub struct OperationResultRecord {
    pub result: OperationResultBody,
    pub subject: Option<SubjectId>,
    pub tenant: Option<TenantId>,
    pub operation: OperationId,
}

pub trait ResultStore: Send + Sync {
    fn get(&self, request_id: RequestId)
        -> Result<Option<OperationResultRecord>, OperationError>;
    fn put(&self, record: OperationResultRecord) -> Result<(), OperationError>;
}

pub enum RevocationFailMode {
    FailClosed,
    AllowWithinStaleness,
}

pub struct RevocationPolicy {
    pub max_staleness: std::time::Duration,
    pub on_unavailable: RevocationFailMode,
}

pub trait RevocationChecker: Send + Sync {
    fn check(&self, identity: &VerifiedIdentity) -> Result<(), AuthenticationError>;
}
```
