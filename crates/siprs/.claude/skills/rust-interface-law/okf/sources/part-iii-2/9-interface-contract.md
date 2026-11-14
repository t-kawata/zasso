---
type: "Section"
title: "9. Interface Contract"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/9-interface-contract"
    title: "9. Interface Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/9-interface-contract"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2727-2727"
---
## 9. Interface Contract

```rust
pub const INTERFACE_REST: InterfaceId = InterfaceId::new("rest");
pub const INTERFACE_WEBSOCKET: InterfaceId = InterfaceId::new("websocket");
pub const INTERFACE_CLI: InterfaceId = InterfaceId::new("cli");
pub const INTERFACE_GRPC: InterfaceId = InterfaceId::new("grpc");
pub const INTERFACE_MCP: InterfaceId = InterfaceId::new("mcp");
pub const INTERFACE_A2A: InterfaceId = InterfaceId::new("a2a");

pub trait InterfaceDriver: Send + Sync {
    fn id(&self) -> InterfaceId;
    fn audience(&self) -> Audience;
}

pub enum ProtocolError {
    Unauthenticated,
    Forbidden,
    Malformed(String),
    Transport(String),
    Protocol(String),
    Internal(String),
}
```

Adapters authorize **protocol-owned resources** (WebSocket subscriptions, A2A
tasks, MCP sessions) and MUST NOT authorize business resources; business
authorization belongs to the operation. This distinction is explicit.

---

## 10. Conformance Harness

