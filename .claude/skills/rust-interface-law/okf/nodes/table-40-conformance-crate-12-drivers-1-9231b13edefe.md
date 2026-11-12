---
type: Table
id: table/40-conformance-crate-12-drivers/1/9231b13edefe
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 9231b13edefe0aceddb8ab218e4b9ed19a45ab012c291b1d219b67feb00a7729
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
| Interface | Driver |
|---|---|
| REST | `tower::ServiceExt::oneshot` against the router. |
| WebSocket | `tokio::io::duplex` plus the upgrade and ticket flow. |
| CLI | `run(args)` with captured stdout/stderr and a test clock. |
| gRPC | In-process tonic service. |
| MCP | In-process MCP transport. |
| A2A | In-process A2A transport. |
