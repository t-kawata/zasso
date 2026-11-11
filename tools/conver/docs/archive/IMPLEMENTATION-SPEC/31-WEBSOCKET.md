# 31 — WebSocket Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-websocket` is a thin, long-lived adapter. It authenticates the upgrade with a
one-time session ticket, converts messages to operation invocations, correlates
responses, forwards events and streams, and manages connection state,
backpressure, expiry, and cleanup.

---

## 2. Dependencies

```toml
[dependencies]
axum = { workspace = true, features = ["ws"] }
futures-util = { workspace = true }
tokio = { workspace = true, features = ["sync", "time"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

`*-websocket` MUST NOT depend on `*-rest`, `*-grpc`, `*-mcp`, or `*-a2a`.

---

## 3. Layout

```text
*-websocket/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # router, state, public re-exports
    ├── state.rs                # WebsocketState, WebsocketConfig
    ├── upgrade/
    │   ├── mod.rs
    │   ├── ticket.rs           # one-time ticket extraction and redemption
    │   └── gate.rs             # origin, size, admission
    ├── envelope/
    │   ├── mod.rs
    │   ├── client.rs           # ClientMessage
    │   └── server.rs           # ServerMessage
    ├── dispatch/
    │   ├── mod.rs              # per-connection dispatcher
    │   ├── correlation.rs      # request_id -> response
    │   └── ordering.rs         # per-resource FIFO
    ├── state/
    │   ├── mod.rs
    │   └── connection.rs       # connection state machine
    ├── limits.rs
    ├── close.rs                # close code policy
    └── tests/
```

---

## 4. Public API

```rust
pub struct WebsocketState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub ticket_store: std::sync::Arc<dyn identity_core::SessionTicketStore>,
    pub config: WebsocketConfig,
}

pub struct WebsocketConfig {
    pub audience: identity_core::Audience,
    pub path: &'static str,             // default "/ws"
    pub max_message_bytes: usize,       // default 1 MiB
    pub max_queue_items: usize,         // default 512
    pub ping_interval: std::time::Duration,
    pub pong_timeout: std::time::Duration,
    pub allowed_origins: Vec<String>,
}

pub fn router(state: WebsocketState) -> axum::Router;
```

The upgrade path is `GET {path}`. The ticket is sent in `X-Session-Ticket`.
A ticket in the query string is forbidden.

---

## 5. One-Time Ticket

The ticket service is a shared operation, `auth.session_ticket.issue`, exposed by
at least one authenticated interface of the project (for example REST, gRPC, or
CLI). A WebSocket-only deployment may expose it through a minimal authenticated
entry point; it is not required to implement REST or gRPC. The WebSocket crate
does not issue tickets itself; it redeems them through `SessionTicketStore`.

```rust
pub struct Ticket {
    pub value: secrecy::SecretString,
    pub redeem_before: std::time::SystemTime,
}

pub trait SessionTicketStore: Send + Sync {
    fn issue(
        &self,
        identity: &VerifiedIdentity,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<Ticket, AuthenticationError>;

    /// Returns a new identity whose binding has the WebSocket interface,
    /// the WebSocket audience, and a fresh connection deadline.
    fn redeem(&self, ticket: &str) -> Result<Arc<VerifiedIdentity>, AuthenticationError>;
}
```

The ticket store implementation lives in `identity-core` behind a `ticket`
feature, for the same sealed-construction reason as the JWT verifier: only code
inside `identity-core` may construct `VerifiedIdentity`.

The ticket's `redeem_before` is the **redemption deadline**. The redeemed
identity's `binding.expires_at` is the **connection authentication deadline**.
They are distinct values and must not be conflated.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-01 | The ticket is random, hashed at rest, single-use, and short-lived (30 seconds). | Properties. | Length and storage. | V3 test. |
| WS-02 | The ticket is bound to the subject, audience, and scopes it was issued for. | Binding. | Extra claims. | V3 test. |
| WS-03 | A redeemed ticket cannot be redeemed again. | Single use. | — | V3 test. |
| WS-04 | The upgrade is rejected before the socket is accepted if redemption fails. | Rejection point. | Error detail. | V3 test. |
| WS-05 | The ticket is sent in a header, never in a query parameter. | Transport. | Header name. | V3 test. |

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

```rust
pub enum ConnectionState {
    Connecting,
    Authenticated { identity: Arc<VerifiedIdentity>, expires_at: Instant },
    Expired,
    Closing { code: u16, reason: &'static str },
    Closed,
}
```

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-06 | A successful upgrade is not permanent authentication. | Expiry check. | Re-auth policy. | V3 expiry test. |
| WS-07 | On expiry, the server either rejects new requests and requests re-auth, or closes with a policy code. | Behavior is explicit. | Choice per config. | V3 test. |
| WS-08 | Expired connections MUST NOT execute new operations. | Rejection. | — | V3 test. |
| WS-09 | Connection state transitions are explicit; illegal transitions are rejected. | State machine. | Transition table. | V3 test. |

---

## 8. Dispatch and Ordering

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-10 | Each request carries a `request_id`; the response carries the same ID. | Correlation. | ID generation. | V3 test. |
| WS-11 | Concurrent requests may interleave. | Allowed. | Concurrency limit. | V3 test. |
| WS-12 | Mutations to the same resource preserve a defined order. | Per-resource FIFO. | Queue implementation. | V3 ordering test. |
| WS-13 | No global ordering is promised. | Non-guarantee documented. | — | V4 review. |
| WS-14 | The adapter calls `Dispatcher::execute_verified`; it does not call handlers directly. | Call path. | — | V3 bypass test. |

---

### 8.1 Streaming

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-23 | `StreamOpen` creates a stream; the server sends `StreamItem` messages followed by exactly one `StreamEnd`. | Lifecycle. | Item encoding. | V3 test. |
| WS-24 | A client stream sends `StreamItem` messages and then `StreamClose`; the server replies with `Response` or `Error`. | Lifecycle. | Item encoding. | V3 test. |
| WS-25 | `StreamCancel` is idempotent, propagates to the operation, and ends with `StreamEnd::Cancelled`. | Cancellation. | Timing. | V3 test. |
| WS-26 | A bidi stream has independent half-close for input and output. | Half-close. | Encoding. | V3 test. |
| WS-27 | Backpressure applies to stream items; an overflow closes with 1013. | Bound. | Threshold. | V3 load test. |
| WS-28 | `stream_id` is unique per connection and is released on `StreamEnd`. | Uniqueness. | Format. | V3 test. |
| WS-29 | The adapter calls the dispatcher's stream methods; it does not implement business streaming. | Call path. | — | V3 bypass test. |

### 8.2 Protocol-owned resources

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-30 | The adapter authorizes protocol-owned subscriptions and streams against the connection identity. | Adapter auth. | Policy. | V3 test. |
| WS-31 | The adapter MUST NOT authorize business resources; that belongs to the operation. | Boundary. | — | V3 bypass test. |
| WS-32 | A subscription or stream is bound to the connection; disconnect cancels it. | Binding. | Cleanup timing. | V3 test. |

---

## 9. Backpressure and Limits

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-15 | Message size, frame size, queue length, and connection count are bounded. | Bounds exist. | Values. | V3 load test. |
| WS-16 | Control queue overflow and audio queue overflow have distinct policies. | Distinct behavior. | Thresholds. | V3 test. |
| WS-17 | A slow reader MUST NOT block the runtime; the connection is closed with 1013. | Close behavior. | Threshold. | V3 test. |
| WS-18 | Ping/pong intervals and timeouts are configured. | Presence. | Values. | V3 test. |

---

## 10. Close Codes and Cleanup

| Code | Meaning |
|---|---|
| 1000 | Normal closure |
| 1008 | Policy violation (authentication, authorization, origin) |
| 1009 | Message too large |
| 1011 | Internal error |
| 1013 | Try again later (backpressure) |

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-19 | Close codes use the table above. | Table. | Reason text. | V3 test. |
| WS-20 | Disconnect cleans up connection-owned subscriptions, streams, and temporary resources. | Cleanup required. | Implementation. | V3 leak test. |
| WS-21 | In-flight operations may complete after disconnect; their results are discarded unless the operation is explicitly cancel-on-disconnect. | Policy explicit. | Per-operation policy. | V3 test. |
| WS-22 | Origin allowlisting is applied before authentication. | Order. | Allowed list. | V3 test. |

---

## 11. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, router, upgrade path, ticket header. | Ticket storage and crypto. |
| Ticket properties and single-use semantics. | Ticket length and TTL within the range. |
| Envelope shape and correlation. | Payload schemas (from the catalog). |
| Connection state machine and expiry behavior. | Re-auth vs close policy. |
| Per-resource FIFO; no global order. | Queue implementation. |
| Close code table and cleanup obligation. | Reason text and resource policy. |
| No handler calls; dispatcher only. | Middleware and instrumentation. |

---

## 12. Conformance Obligations

1. Ticket redemption, single use, expiry, and audience binding.
2. Ticket in query is rejected.
3. Request/response correlation under concurrency.
4. Per-resource FIFO mutation order.
5. Expiry rejects new operations.
6. Backpressure closes with 1013; size violation with 1009.
7. Disconnect cleanup leaves no connection-owned resources.
8. No direct handler call; dispatcher bypass test.
9. Audience isolation: a REST token cannot upgrade.
10. `cargo test -p <project>-websocket` and `cargo clippy -p
    <project>-websocket -- -D warnings`.
11. The conformance report names `WS-01` through `WS-32`.
