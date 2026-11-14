---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-11/2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-11/2-dependencies"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5153-5153"
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

## 3. Layout

