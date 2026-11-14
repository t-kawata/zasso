---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/2-dependencies"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4147-4147"
---
## 2. Dependencies

```toml
[dependencies]
axum = { workspace = true, features = ["ws"] }
futures-util = { workspace = true }
tokio = { workspace = true, features = ["sync", "time"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

`*-websocket` MUST NOT depend on `*-rest`, `*-grpc`, `*-mcp`, or `*-a2a`.

---

## 3. Layout

