---
type: CodeBlock
id: codeblock/34-mcp-adapter-2-dependencies/1/eabb09bcf027
phase: adapter
delivery: must
applies_to: mcp
requires: []
references: []
content_sha256: eabb09bcf02793f75e61c4f63e85970de43636b7c2f327e20d2d6790038d0db6
source: sources/34-MCP.md
---
```toml
[dependencies]
rmcp = { workspace = true }
tokio = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```
