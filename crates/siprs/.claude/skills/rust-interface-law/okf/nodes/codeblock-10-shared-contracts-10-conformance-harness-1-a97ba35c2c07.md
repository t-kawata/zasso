---
type: CodeBlock
id: codeblock/10-shared-contracts-10-conformance-harness/1/a97ba35c2c07
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: a97ba35c2c075269c58c4173a9428b6defce91d4a00d0302a799c033c31a8c86
source: sources/10-CONTRACTS.md
---
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
