---
type: CodeBlock
id: codeblock/35-a2a-adapter-4-public-api/1/ab99520b7f1b
phase: adapter
delivery: must
applies_to: a2a
requires: []
references: []
content_sha256: ab99520b7f1b154bce611c5dbd813fe30bd3b7c2db96f5c6503d8c015a4fa240
source: sources/35-A2A.md
---
```rust
pub struct A2aState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: A2aConfig,
}

pub struct A2aConfig {
    pub audience: identity_core::Audience,
    pub agent_name: &'static str,
    pub agent_description: &'static str,
    pub task_store: std::sync::Arc<dyn TaskStore>,
    pub security_schemes: Vec<SecurityScheme>,
    pub protocol_version: &'static str,
    pub transport_profile: &'static str,
    pub capabilities: Vec<&'static str>,
}

pub fn server(state: A2aState) -> a2a_server::A2aServer;

pub struct TaskOwner {
    pub subject: identity_core::SubjectId,
    pub tenant: Option<identity_core::TenantId>,
}

pub trait TaskStore: Send + Sync {
    fn load(
        &self,
        owner: &TaskOwner,
        task_id: &str,
    ) -> operation_contract::BoxFuture<'_, Option<serde_json::Value>>;

    fn save(
        &self,
        owner: &TaskOwner,
        task_id: &str,
        state: serde_json::Value,
    ) -> operation_contract::BoxFuture<'_, Result<(), String>>;
}
```
