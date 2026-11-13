---
type: CodeBlock
id: codeblock/33-grpc-adapter-2-dependencies/1/ab2e66392427
phase: adapter
delivery: must
applies_to: grpc
requires: []
references: []
content_sha256: ab2e66392427b5ea1caec9868df4002dcb8f669bc9c8f64c349ca62f4ff02a9b
source: sources/33-GRPC.md
---
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
