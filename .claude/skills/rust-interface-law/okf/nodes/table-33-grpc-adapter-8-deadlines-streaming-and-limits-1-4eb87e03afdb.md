---
type: Table
id: table/33-grpc-adapter-8-deadlines-streaming-and-limits/1/4eb87e03afdb
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: 4eb87e03afdb212e4cb14ea56a8bf15f58206f3cb8fc2e11b26148513ebed3ff
source: docs/archive/IMPLEMENTATION-SPEC/33-GRPC.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-12 | The request deadline is propagated into `WireContext`. | Propagation. | — | V3 test. |
| GRPC-13 | `U` maps to unary; `S`, `C`, `B` map to the corresponding stream. | Mode mapping. | Stream internals. | V3 test. |
| GRPC-14 | Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID. | Cancellation policy. | Per-operation support. | V3 test. |
| GRPC-15 | Message size and keepalive limits are configured. | Presence. | Values. | V3 load test. |
| GRPC-16 | Transport uses TLS outside loopback-only local mode. | TLS rule. | Certificate source. | V2 config check. |
