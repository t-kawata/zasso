---
type: "Section"
title: "6. Envelope"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/6-envelope"
    title: "6. Envelope"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/6-envelope"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4272-4272"
---
## 6. Envelope

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

The envelope is fixed. The payload is the operation's typed request/response.

---

## 7. Connection State

