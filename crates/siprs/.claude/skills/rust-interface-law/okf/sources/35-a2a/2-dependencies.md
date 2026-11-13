---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/35-A2A.md"
    id: "35-a2a-2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/35-A2A.md"
x-source-span: "19-37"
---
## 2. Dependencies

```toml
[dependencies]
a2a = { workspace = true }          # package a2a-lf
a2a-server = { workspace = true }   # package a2a-server-lf
tokio = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

The dependency names and package names are recorded in the workspace manifest.
A similar-named non-official crate must not be substituted.

---

