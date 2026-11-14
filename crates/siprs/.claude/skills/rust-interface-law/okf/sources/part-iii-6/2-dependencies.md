---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-6/2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-6/2-dependencies"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3891-3891"
---
## 2. Dependencies

```toml
[dependencies]
axum = { workspace = true, features = ["json"] }
tower = { workspace = true }
tower-http = { workspace = true, features = ["cors", "trace"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
utoipa = { workspace = true }
utoipa-swagger-ui = { workspace = true, features = ["axum"] }
```

`*-rest` MUST NOT depend on `*-core`, `*-operation` internals, or another
interface crate. It depends on the contract crates and the dispatcher.

---

## 3. Layout

