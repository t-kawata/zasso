---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-9/2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-9/2-dependencies"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4736-4736"
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

## 3. Layout

