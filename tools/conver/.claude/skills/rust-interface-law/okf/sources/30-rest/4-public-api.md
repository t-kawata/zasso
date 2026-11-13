---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/30-REST.md"
    id: "30-rest-4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/30-REST.md"
x-source-span: "71-104"
---
## 4. Public API

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

`router` builds two routers and merges them:

- **Public router**: `/health` and operations whose catalog authentication is
  `anonymous` (`auth.token.issue`, `auth.refresh`). They still go through
  `Dispatcher::execute_anonymous`; a public route is not a dispatcher bypass.
- **Protected router**: every operation whose catalog authentication is
  `required`, wrapped with the bearer middleware. The middleware verifies the
  token and its binding, then the operation authorizes the target.

Every endpoint uses the semantic envelope `{context?, request}` and returns
`{request_id, result}` or `{request_id, error}`. Aliases are path/method sugar
over the same envelope; they do not use a different wire shape.

---

