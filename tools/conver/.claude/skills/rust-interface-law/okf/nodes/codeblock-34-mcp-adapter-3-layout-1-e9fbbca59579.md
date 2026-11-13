---
type: CodeBlock
id: codeblock/34-mcp-adapter-3-layout/1/e9fbbca59579
phase: adapter
delivery: must
applies_to: mcp
requires: []
references: []
content_sha256: e9fbbca59579d224da25648a02a9a0b56ed3de29bab4cdb3c158ec02053c7f68
source: sources/34-MCP.md
---
```text
*-mcp/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # server(), McpState, McpConfig
    ├── tools/
    │   ├── mod.rs
    │   └── generated.rs        # one tool per applicable operation
    ├── auth/
    │   ├── mod.rs
    │   ├── discovery.rs        # authorization server metadata
    │   └── challenge.rs        # WWW-Authenticate / resource metadata
    ├── schema/
    │   └── generated.rs        # tool input/output schemas
    ├── error/
    │   └── mapping.rs          # OperationError -> MCP error
    └── tests/
```
