---
type: "Section"
title: "5.8 Errors"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-8-errors"
    title: "5.8 Errors"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-8-errors"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2367-2367"
---
### 5.8 Errors

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

The protocol category table is fixed; adapters use `OperationErrorBody`, never
the internal `source`.

---

## 6. Idempotency

