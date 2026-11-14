---
type: "Section"
title: "4. Public API"
description: "```rust"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-6/4-public-api"
    title: "4. Public API"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-6/4-public-api"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3944-3944"
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

## 5. Generated Bindings

