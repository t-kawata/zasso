---
type: "Section"
title: "8. Wire Envelope and Protocol Bindings"
description: "The **semantic envelope** is shared. Its protocol representation is binding-"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/8-wire-envelope-and-protocol-bindings"
    title: "8. Wire Envelope and Protocol Bindings"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/8-wire-envelope-and-protocol-bindings"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2653-2653"
---
## 8. Wire Envelope and Protocol Bindings

The **semantic envelope** is shared. Its protocol representation is binding-
specific; it is not required to be JSON bytes on every wire.

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

### 8.1 Protobuf context

