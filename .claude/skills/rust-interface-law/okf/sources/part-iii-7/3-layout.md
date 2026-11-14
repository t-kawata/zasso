---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4165-4165"
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

