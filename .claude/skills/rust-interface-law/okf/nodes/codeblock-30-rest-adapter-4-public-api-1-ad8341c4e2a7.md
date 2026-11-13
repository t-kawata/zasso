---
type: CodeBlock
id: codeblock/30-rest-adapter-4-public-api/1/ad8341c4e2a7
phase: adapter
delivery: must
applies_to: rest
requires: []
references: []
content_sha256: ad8341c4e2a787d57160f85b31b46599dc87f83e99dc94d935aa3385fa7b29e5
source: sources/30-REST.md
---
```rust
pub struct RestState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: RestConfig,
}

pub struct RestConfig {
    pub audience: identity_core::Audience,
    pub public_paths: Vec<&'static str>,
    pub cors_origins: Vec<String>,
    pub max_body_bytes: usize,
}

pub fn router(state: RestState) -> axum::Router;
```
