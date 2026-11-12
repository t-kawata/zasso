---
type: CodeBlock
id: codeblock/40-conformance-crate-3-layout/1/9c626fde6db9
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 9c626fde6db93ab99594df8a392b0cd2a9480dddb74d69d346e1e774fdddbc89
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
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
