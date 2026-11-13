---
type: "Section"
title: "10. Conformance Harness"
description: "```rust"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-10-conformance-harness"
    title: "10. Conformance Harness"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "1338-1430"
---
## 10. Conformance Harness

```rust
pub struct Case {
    pub name: &'static str,
    pub operation: OperationId,
    pub authentication: AuthCase,
    pub principal: Option<TestPrincipal>,
    pub wire: WireContext,
    pub request: serde_json::Value,
    pub stream: Option<StreamScript>,
    pub fixture: FixtureId,
    pub expected: Expected,
    pub expected_state: Option<StateExpectation>,
    pub expected_error_code: Option<ErrorCode>,
}

pub enum AuthCase {
    Valid,
    Missing,
    Malformed,
    WrongAudience,
    Expired,
    Revoked,
    WrongTokenType,
    NoScope,
}

pub struct TestPrincipal {
    pub subject: SubjectId,
    pub tenant: Option<TenantId>,
    pub scopes: ScopeSet,
    pub audience: Audience,
    pub actor: Option<ActorId>,
    pub on_behalf_of: Option<SubjectId>,
}

pub enum Expected {
    Success(ValueMatcher),
    Error { category: ErrorCategory, retryable: bool },
}

pub enum ValueMatcher {
    Exact(serde_json::Value),
    Subset(serde_json::Value),
    Any,
    Regex(String),
}

pub enum StreamScript {
    Server { items: Vec<serde_json::Value>, cancel_after: Option<usize> },
    Client { items: Vec<serde_json::Value>, eof: bool, cancel_after: Option<usize> },
    Bidi { items: Vec<serde_json::Value>, cancel_after: Option<usize> },
}

pub struct InvocationOutcome {
    pub result: Option<serde_json::Value>,
    pub error: Option<OperationErrorBody>,
    pub state: Option<serde_json::Value>,
    pub events: Vec<DomainEvent>,
    pub stream: Vec<StreamEvent>,
}

pub trait ConformanceDriver: Send + Sync {
    fn id(&self) -> InterfaceId;
    fn invoke(&self, case: &Case) -> Result<InvocationOutcome, ProtocolError>;
}

pub fn run_matrix(
    drivers: &[Box<dyn ConformanceDriver>],
    cases: &[Case],
) -> ConformanceReport;
```

`FixtureId` identifies a deterministic fixture with setup and reset. `Case`
includes state expectations, authentication-material expectations, and stream
scripts. The harness compares `OperationErrorBody.code` as well as category and
retryability.

The harness has an **independent oracle**: expected results are derived from the
operation specification, not from one interface's output. A cross-interface
match alone is insufficient.

Out-of-process drivers are required for TLS termination, real WebSocket
upgrade, CLI process/signal/file-permission boundaries, and any protocol
behavior that cannot be exercised in-process.

The compile-fail test is supplemented by a public-API audit: the trusted
constructor is not reachable from adapter crates, and the allowed call sites are
listed.

---

