---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "69-95"
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

