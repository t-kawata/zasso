---
type: CodeBlock
id: codeblock/20-core-crate-2-dependencies/1/571a243ebedf
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 571a243ebedf57549b8d8332deb6ec0bda981d63cb40f4896bcbacbc5021d1c0
source: sources/20-CORE.md
---
```toml
[dependencies]
serde = { workspace = true, features = ["derive"] }
thiserror = { workspace = true }
uuid = { workspace = true, features = ["v7", "serde"] }
chrono = { workspace = true }
secrecy = { workspace = true }
# no axum, tonic, rmcp, a2a-*, clap, jsonwebtoken, oauth2
```
