---
type: CodeBlock
id: codeblock/35-a2a-adapter-2-dependencies/1/fa91929f2bb6
phase: adapter
delivery: must
applies_to: a2a
requires: []
references: []
content_sha256: fa91929f2bb620027ee0ecd0539c900033ac0b7217fc79e0c2c4f13917ee693a
source: sources/35-A2A.md
---
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
