---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "19-38"
---
## 2. Dependencies

```toml
[dependencies]
clap = { workspace = true, features = ["derive"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
tokio = { workspace = true, features = ["rt-multi-thread", "macros"] }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
reqwest = { workspace = true, features = ["json"] }   # remote REST mode
tonic = { workspace = true }                           # remote gRPC mode
```

`*-cli` MUST NOT depend on `*-rest`, `*-grpc`, `*-websocket`, `*-mcp`, or
`*-a2a`. It may speak the protocol directly or use a generated client module.

---

