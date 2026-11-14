---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-10/2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-10/2-dependencies"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4967-4967"
---
## 2. Dependencies

```toml
[dependencies]
rmcp = { workspace = true }
tokio = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

`*-mcp` MUST NOT depend on `*-rest`, `*-grpc`, or another interface crate.

---

## 3. Layout

