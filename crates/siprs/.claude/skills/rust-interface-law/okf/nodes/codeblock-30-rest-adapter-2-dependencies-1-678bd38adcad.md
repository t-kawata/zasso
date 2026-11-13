---
type: CodeBlock
id: codeblock/30-rest-adapter-2-dependencies/1/678bd38adcad
phase: adapter
delivery: must
applies_to: rest
requires: []
references: []
content_sha256: 678bd38adcadf40e942c272815a522876390e323d178268b69a9312e424112ba
source: sources/30-REST.md
---
```toml
[dependencies]
axum = { workspace = true, features = ["json"] }
tower = { workspace = true }
tower-http = { workspace = true, features = ["cors", "trace"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
utoipa = { workspace = true }
utoipa-swagger-ui = { workspace = true, features = ["axum"] }
```
