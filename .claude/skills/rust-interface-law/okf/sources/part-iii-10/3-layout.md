---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-10/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-10/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4984-4984"
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

## 4. Public API

