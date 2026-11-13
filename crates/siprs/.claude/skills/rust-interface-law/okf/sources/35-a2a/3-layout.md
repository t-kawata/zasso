---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/35-A2A.md"
    id: "35-a2a-3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/35-A2A.md"
x-source-span: "38-65"
---
## 3. Layout

```text
*-a2a/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # server(), A2aState, A2aConfig
    ├── agent/
    │   ├── mod.rs
    │   └── card.rs             # generated AgentCard and skills
    ├── task/
    │   ├── mod.rs
    │   ├── mapping.rs          # task/message <-> operation
    │   └── store.rs            # task store (protocol state)
    ├── auth/
    │   ├── mod.rs
    │   └── security.rs         # spec-required security scheme
    ├── stream/
    │   └── mod.rs              # task updates and SSE/stream events
    ├── error/
    │   └── mapping.rs          # OperationError -> A2A error
    └── tests/
```

---

