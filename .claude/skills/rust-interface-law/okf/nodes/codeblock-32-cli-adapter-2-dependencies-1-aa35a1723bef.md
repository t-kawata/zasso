---
type: CodeBlock
id: codeblock/32-cli-adapter-2-dependencies/1/aa35a1723bef
phase: adapter
delivery: must
applies_to: cli
requires: []
references: []
content_sha256: aa35a1723bef07e33ceb2a65c9b14bc968423a38a4f3ab5258c94db56c0b4679
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
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
