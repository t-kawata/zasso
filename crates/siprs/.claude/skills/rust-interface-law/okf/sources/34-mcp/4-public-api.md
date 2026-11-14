---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/34-MCP.md"
    id: "34-mcp-4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/34-MCP.md"
x-source-span: "61-84"
---
## 4. Public API

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

---

