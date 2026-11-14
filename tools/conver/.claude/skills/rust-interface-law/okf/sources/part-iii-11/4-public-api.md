---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-11/4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-11/4-public-api"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5200-5200"
---
## 4. Public API

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

---

## 5. Agent Card and Skills

