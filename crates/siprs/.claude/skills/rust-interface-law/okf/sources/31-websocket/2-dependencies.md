---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "19-36"
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

