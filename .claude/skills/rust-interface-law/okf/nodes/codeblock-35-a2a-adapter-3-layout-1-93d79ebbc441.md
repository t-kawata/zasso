---
type: CodeBlock
id: codeblock/35-a2a-adapter-3-layout/1/93d79ebbc441
phase: adapter
delivery: must
applies_to: a2a
requires: []
references: []
content_sha256: 93d79ebbc441cbe510c2b683b83e61460ad2a2be0c68ce968e439daa4537f6d1
source: sources/35-A2A.md
---
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
