---
type: "Rule"
title: "GRPC-14 — Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID."
description: "Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-14"
    title: "GRPC-14"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "grpc"
x-enforcement: "conformance driver"
x-parent: "GRPC"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "GRPC-14"
x-source-part: "Part III.9"
x-source-span: "195-195"
x-verification: "V3 test."
---
# GRPC-14

Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[8. Deadlines, Streaming, and Limits](../../sources/part-iii-9/8-deadlines-streaming-and-limits.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [GRPC-12 — The request deadline is propagated into `WireContext`.](grpc-12.md)
- [GRPC-13 — `U` maps to unary; `S`, `C`, `B` map to the corresponding stream.](grpc-13.md)
- [GRPC-15 — Message size and keepalive limits are configured.](grpc-15.md)
- [GRPC-16 — Transport uses TLS outside loopback-only local mode.](grpc-16.md)

[^grpc-14]: sources/EXPERT-REVIEW-PACKAGE.md

