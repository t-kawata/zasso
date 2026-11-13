---
type: "Section"
title: "3. Layout"
description: "```text"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-3-layout"
    title: "3. Layout"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "46-92"
---
## 3. Layout

```text
*-conformance/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # run_matrix, run_rules, Report
    ├── matrix/
    │   ├── mod.rs
    │   └── generated.rs        # operation x interface rows
    ├── fixtures/
    │   ├── mod.rs
    │   └── generated.rs        # deterministic setup/reset
    ├── cases/
    │   ├── mod.rs
    │   ├── generated.rs        # normal, failure, state, idempotency
    │   └── negative_auth.rs
    ├── drivers/
    │   ├── mod.rs
    │   ├── rest.rs
    │   ├── websocket.rs
    │   ├── cli.rs
    │   ├── grpc.rs
    │   ├── mcp.rs
    │   └── a2a.rs
    ├── oracles/
    │   ├── mod.rs
    │   ├── result.rs           # semantic comparison
    │   ├── error.rs            # code, category, retryability
    │   ├── state.rs            # state and side-effect oracle
    │   ├── events.rs           # outbox and event order
    │   └── stream.rs           # EOF, error, cancel, backpressure
    ├── security/
    │   ├── binding.rs          # interface/audience/expiry
    │   ├── bypass.rs           # operation authorization bypass
    │   ├── identity.rs         # compile-fail and public API audit
    │   └── delegation.rs
    ├── report/
    │   ├── mod.rs
    │   └── markdown.rs
    └── tests/
```

---

