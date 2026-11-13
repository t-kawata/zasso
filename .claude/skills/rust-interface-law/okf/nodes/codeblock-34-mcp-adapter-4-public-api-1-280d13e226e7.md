---
type: CodeBlock
id: codeblock/34-mcp-adapter-4-public-api/1/280d13e226e7
phase: adapter
delivery: must
applies_to: mcp
requires: []
references: []
content_sha256: 280d13e226e750b69d41f64f9b146a6c8b3e5c6288698505a9649a225beab493
source: sources/34-MCP.md
---
```rust
pub struct McpState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: McpConfig,
}

pub struct McpConfig {
    pub audience: identity_core::Audience,
    pub resource_metadata_url: String,
    pub authorization_server: String,
    pub tool_prefix: Option<&'static str>,
    pub protocol_version: &'static str,
    pub transport_profile: &'static str,
    pub capabilities: Vec<&'static str>,
}

pub fn server(state: McpState) -> rmcp::Server;
```
