---
type: CodeBlock
id: codeblock/31-websocket-adapter-6-envelope/1/1ff65cf280b1
phase: adapter
delivery: must
applies_to: websocket
requires: []
references: []
content_sha256: 1ff65cf280b1ef85d53ea97032fb8b3a44d55566489d6c4d7f52f30d1045b652
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
```rust
#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Request {
        request_id: RequestId,
        operation_id: OperationId,
        payload: serde_json::Value,
        context: Option<WireContext>,
    },
    StreamOpen {
        request_id: RequestId,
        stream_id: String,
        operation_id: OperationId,
        payload: serde_json::Value,
        context: Option<WireContext>,
    },
    StreamItem {
        stream_id: String,
        item: serde_json::Value,
    },
    StreamClose {
        stream_id: String,
    },
    StreamCancel {
        stream_id: String,
    },
    Ping,
    Close,
}

#[derive(serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Response {
        request_id: RequestId,
        result: serde_json::Value,
    },
    Error {
        request_id: RequestId,
        error: OperationErrorBody,
    },
    Event {
        subscription_id: String,
        item: serde_json::Value,
    },
    StreamItem {
        stream_id: String,
        item: serde_json::Value,
    },
    StreamEnd {
        stream_id: String,
        outcome: StreamOutcome,
    },
    Pong,
}

pub enum StreamOutcome {
    Eof,
    Cancelled,
    Error(OperationErrorBody),
}
```
