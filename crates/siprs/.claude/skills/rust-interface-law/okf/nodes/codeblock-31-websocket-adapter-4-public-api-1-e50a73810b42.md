---
type: CodeBlock
id: codeblock/31-websocket-adapter-4-public-api/1/e50a73810b42
phase: adapter
delivery: must
applies_to: websocket
requires: []
references: []
content_sha256: e50a73810b42f5fa3ab09b9893aaf014d6aca369f6b27cfd0dc0cae1184debc5
source: sources/31-WEBSOCKET.md
---
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
