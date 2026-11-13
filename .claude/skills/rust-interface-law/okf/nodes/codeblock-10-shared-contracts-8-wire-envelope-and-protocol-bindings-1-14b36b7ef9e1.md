---
type: CodeBlock
id: codeblock/10-shared-contracts-8-wire-envelope-and-protocol-bindings/1/14b36b7ef9e1
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 14b36b7ef9e1a238df601cfaa9c738d6adbc348a05fdb0462b8450a0ddb49f7f
source: sources/10-CONTRACTS.md
---
```rust
pub struct WireContext {
    pub request_id: Option<RequestId>,
    pub deadline_unix_ns: Option<i64>,
    pub idempotency_key: Option<IdempotencyKey>,
    pub trace_id: Option<TraceId>,
}

impl WireContext {
    /// Merge body context and header context. A field present in both with
    /// different values is a conflict, not an override.
    pub fn merge(self, other: WireContext) -> Result<Self, ContractError>;
}

pub struct SemanticRequest {
    pub context: WireContext,
    pub request: serde_json::Value,
}

pub struct SemanticReply {
    pub request_id: RequestId,
    pub outcome: SemanticOutcome,
}

pub enum SemanticOutcome {
    Result(serde_json::Value),
    Error(OperationErrorBody),
}

impl SemanticReply {
    pub fn from_result(result: OperationResultBody) -> Self;
}
```
