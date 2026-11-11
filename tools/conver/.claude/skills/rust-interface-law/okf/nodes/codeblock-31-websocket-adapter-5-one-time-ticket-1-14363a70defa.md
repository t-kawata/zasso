---
type: CodeBlock
id: codeblock/31-websocket-adapter-5-one-time-ticket/1/14363a70defa
phase: adapter
delivery: must
applies_to: websocket
requires: []
references: []
content_sha256: 14363a70defa1fe522b546d5052e1d797f17e7623bf49eb28498d9425d99bc10
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
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
