---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/34-MCP.md"
    id: "34-mcp-2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/34-MCP.md"
x-source-span: "19-35"
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

