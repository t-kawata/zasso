---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "20-38"
---
## 2. Dependencies

```toml
[dependencies]
tonic = { workspace = true, features = ["transport", "codegen"] }
prost = { workspace = true }
tonic-prost = { workspace = true }
tokio = { workspace = true, features = ["sync", "time"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }

[build-dependencies]
tonic-prost-build = { workspace = true }
```

---

