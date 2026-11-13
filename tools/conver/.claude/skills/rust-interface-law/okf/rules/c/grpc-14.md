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
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
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

[8. Deadlines, Streaming, and Limits](../../sources/33-grpc/8-deadlines-streaming-and-limits.md)

[^grpc-14]: sources/33-GRPC.md

