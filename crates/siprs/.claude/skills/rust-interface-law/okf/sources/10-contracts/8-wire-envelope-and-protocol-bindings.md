---
type: "Section"
title: "8. Wire Envelope and Protocol Bindings"
description: "The **semantic envelope** is shared. Its protocol representation is binding-"
sources: 
  - resource: "sources/10-CONTRACTS.md"
    id: "10-contracts-8-wire-envelope-and-protocol-bindings"
    title: "8. Wire Envelope and Protocol Bindings"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/10-CONTRACTS.md"
x-source-span: "1233-1306"
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

The gRPC binding uses typed messages, but the semantic context fields and their
field numbers are fixed:

```proto
message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}
```

### 8.1 Bindings

| Interface | Request binding | Reply binding |
|---|---|---|
| REST | JSON `{context?, request}` | JSON `{request_id, result}` or `{request_id, error}` |
| WebSocket | `{type:"request", request_id, operation_id, payload, context?}` | `{type:"response", request_id, result|error}` |
| CLI | typed arguments converted to the operation request | JSON/JSONL with `request_id` |
| gRPC | typed message with `Context` and typed request fields | typed message with `request_id` and `oneof result/error` |
| MCP | tool input plus context | tool result plus `request_id` |
| A2A | task/message mapped to the operation request | task artifact plus `request_id` |

Every binding returns the `request_id` in a place the client can read. REST
aliases use the same semantic envelope; an alias is path/method sugar, not a
different wire shape.

The protobuf schema may use typed messages. It MUST carry the semantic
`Context` fields and the `request_id` on the reply. The universal "JSON bytes in
protobuf" rule from the previous version is withdrawn.

---

