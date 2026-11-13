---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "21-operation-2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/21-OPERATION.md"
x-source-span: "20-34"
---
## 2. Dependencies

```toml
[dependencies]
<project>-core = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
thiserror = { workspace = true }
# no axum, tonic, rmcp, a2a-*, clap, jsonwebtoken, oauth2
```

---

