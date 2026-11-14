---
type: "Section"
title: "8. Deadlines, Streaming, and Limits"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-9/8-deadlines-streaming-and-limits"
    title: "8. Deadlines, Streaming, and Limits"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-9/8-deadlines-streaming-and-limits"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4905-4905"
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

## 9. Fixed and Open

## Rules in this section

- [GRPC-12 — The request deadline is propagated into `WireContext`.](../../rules/c/grpc-12.md)
- [GRPC-13 — `U` maps to unary; `S`, `C`, `B` map to the corresponding stream.](../../rules/c/grpc-13.md)
- [GRPC-14 — Client cancellation cancels the operation when the operation supports it; oth...](../../rules/c/grpc-14.md)
- [GRPC-15 — Message size and keepalive limits are configured.](../../rules/c/grpc-15.md)
- [GRPC-16 — Transport uses TLS outside loopback-only local mode.](../../rules/c/grpc-16.md)

