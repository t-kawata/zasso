---
type: CodeBlock
id: codeblock/31-websocket-adapter-2-dependencies/1/a9968defaafe
phase: adapter
delivery: must
applies_to: websocket
requires: []
references: []
content_sha256: a9968defaafef1f8b4c432865818234a9a2f64f951f7baae4e6db48b415ef805
source: sources/31-WEBSOCKET.md
---
```toml
[dependencies]
axum = { workspace = true, features = ["ws"] }
futures-util = { workspace = true }
tokio = { workspace = true, features = ["sync", "time"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```
