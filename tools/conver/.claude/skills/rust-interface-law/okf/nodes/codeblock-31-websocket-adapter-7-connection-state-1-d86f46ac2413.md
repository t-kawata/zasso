---
type: CodeBlock
id: codeblock/31-websocket-adapter-7-connection-state/1/d86f46ac2413
phase: adapter
delivery: must
applies_to: websocket
requires: []
references: []
content_sha256: d86f46ac2413a89524ecae2a5ee17afaae82cd7c28b8f07ae6634e8630620718
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
```rust
pub enum ConnectionState {
    Connecting,
    Authenticated { identity: Arc<VerifiedIdentity>, expires_at: Instant },
    Expired,
    Closing { code: u16, reason: &'static str },
    Closed,
}
```
