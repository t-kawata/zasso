---
type: "Section"
title: "8. Deadlines, Streaming, and Limits"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-8-deadlines-streaming-and-limits"
    title: "8. Deadlines, Streaming, and Limits"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "189-200"
---
## 8. Deadlines, Streaming, and Limits

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-12 | The request deadline is propagated into `WireContext`. | Propagation. | — | V3 test. |
| GRPC-13 | `U` maps to unary; `S`, `C`, `B` map to the corresponding stream. | Mode mapping. | Stream internals. | V3 test. |
| GRPC-14 | Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID. | Cancellation policy. | Per-operation support. | V3 test. |
| GRPC-15 | Message size and keepalive limits are configured. | Presence. | Values. | V3 load test. |
| GRPC-16 | Transport uses TLS outside loopback-only local mode. | TLS rule. | Certificate source. | V2 config check. |

---

