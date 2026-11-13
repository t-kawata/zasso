---
type: "Section"
title: "11. Implementation Contract"
description: "`axum = { version = \"=0.8.9\", features = [\"ws\"] }`; `futures-util = { version = \"=0.3.31\", features = [\"std\", \"async-await\", \"sink\"] }`; `tokio = { version = \"=1.48.0\", features = [\"sync\", \"time\", \"io"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-11-implementation-contract"
    title: "11. Implementation Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "328-353"
---
## 11. Implementation Contract

### 11.1 Cargo contract

`axum = { version = "=0.8.9", features = ["ws"] }`; `futures-util = { version = "=0.3.31", features = ["std", "async-await", "sink"] }`; `tokio = { version = "=1.48.0", features = ["sync", "time", "io-util"] }`.

### 11.2 Required API sequence

Origin allowlist -> single ticket header -> one-time redemption -> connection lease -> upgrade -> split -> bounded queue -> dispatcher stream bridge -> cancel/join/release.

### 11.3 Forbidden patterns

Query-string ticket, unbounded channel, blocking send in async task, operation implementation call, stream without terminal event.

### 11.4 Template

`templates/websocket/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-33 | Origin validation and ticket redemption MUST complete before WebSocket acceptance. | Pre-accept. | Header name. | V3 pre-accept probe. |
| WS-34 | All connection queues and dispatch concurrency MUST be bounded, with overload producing the configured 1013 close path. | Bounds. | Capacity values. | V3 overload test. |
| WS-35 | Stream input closure, output termination, and cancellation MUST be distinct states with deterministic cleanup. | State model. | Timing. | V3 lifecycle test. |

