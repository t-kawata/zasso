---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-4/2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-4/2-dependencies"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "3145-3145"
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

## 3. Layout

