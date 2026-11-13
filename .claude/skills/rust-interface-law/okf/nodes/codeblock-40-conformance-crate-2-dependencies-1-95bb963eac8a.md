---
type: CodeBlock
id: codeblock/40-conformance-crate-2-dependencies/1/95bb963eac8a
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 95bb963eac8ab02a2bab2d3c1dd10b325594d0fd85ee51a79bb98a156c1366ff
source: sources/40-CONFORMANCE.md
---
```toml
[dependencies]
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }

[dev-dependencies]
<project>-core = { workspace = true }
<project>-operation = { workspace = true }
<project>-rest = { workspace = true }        # only if profile rest
<project>-websocket = { workspace = true }   # only if profile websocket
<project>-cli = { workspace = true }         # only if profile cli
<project>-grpc = { workspace = true }        # only if profile grpc
<project>-mcp = { workspace = true }         # only if profile mcp
<project>-a2a = { workspace = true }         # only if profile a2a
```
