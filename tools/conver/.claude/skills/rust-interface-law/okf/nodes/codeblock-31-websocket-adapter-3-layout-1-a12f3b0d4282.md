---
type: CodeBlock
id: codeblock/31-websocket-adapter-3-layout/1/a12f3b0d4282
phase: adapter
delivery: must
applies_to: websocket
requires: []
references: []
content_sha256: a12f3b0d428239280d60258f45cfd098a25899e00b084aebf678ef2652958a93
source: sources/31-WEBSOCKET.md
---
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
