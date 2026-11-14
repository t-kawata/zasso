---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-3/2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-3/2-dependencies"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2919-2919"
---
## 2. Dependencies

```toml
[dependencies]
serde = { workspace = true, features = ["derive"] }
thiserror = { workspace = true }
uuid = { workspace = true, features = ["v7", "serde"] }
chrono = { workspace = true }
secrecy = { workspace = true }
# no axum, tonic, rmcp, a2a-*, clap, jsonwebtoken, oauth2
```

`*-core` MAY depend on pure utility crates (time, UUID, decimal). It MUST NOT
depend on a transport SDK, an authentication implementation, or a persistence
driver. Persistence ports are traits; the driver lives in an adapter crate.

---

## 3. Layout

