---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "37-68"
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

