---
type: CodeBlock
id: codeblock/21-operation-crate-2-dependencies/1/90b580c3223c
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 90b580c3223c305fc5a78883311d406b28612a09103e57b95cad4a667eac5392
source: docs/archive/IMPLEMENTATION-SPEC/21-OPERATION.md
---
```toml
[dependencies]
<project>-core = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
thiserror = { workspace = true }
# no axum, tonic, rmcp, a2a-*, clap, jsonwebtoken, oauth2
```
