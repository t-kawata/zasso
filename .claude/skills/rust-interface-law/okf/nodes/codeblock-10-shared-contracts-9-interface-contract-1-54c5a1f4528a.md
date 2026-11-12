---
type: CodeBlock
id: codeblock/10-shared-contracts-9-interface-contract/1/54c5a1f4528a
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 54c5a1f4528a8293a086fd5c481a2acc1818ec8ad50b096a4992f6a5654a2dfd
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
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
