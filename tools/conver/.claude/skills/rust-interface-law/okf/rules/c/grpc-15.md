---
type: "Rule"
title: "GRPC-15 — Message size and keepalive limits are configured."
description: "Message size and keepalive limits are configured."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-15"
    title: "GRPC-15"
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
x-rule-id: "GRPC-15"
x-source-part: "Part III.9"
x-source-span: "196-196"
x-verification: "V3 load test."
---
# GRPC-15

Message size and keepalive limits are configured.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 load test. |
| Enforcement | conformance driver |

[8. Deadlines, Streaming, and Limits](../../sources/33-grpc/8-deadlines-streaming-and-limits.md)

[^grpc-15]: sources/33-GRPC.md

