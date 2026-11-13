---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/34-MCP.md"
    id: "34-mcp-3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/34-MCP.md"
x-source-span: "36-60"
---
## 3. Layout

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

---

