---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-11/3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-11/3-layout"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5172-5172"
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

## 4. Public API

