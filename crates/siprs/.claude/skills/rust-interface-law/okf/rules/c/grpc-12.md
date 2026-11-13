---
type: "Rule"
title: "GRPC-12 — The request deadline is propagated into `WireContext`."
description: "The request deadline is propagated into `WireContext`."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-12"
    title: "GRPC-12"
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
x-rule-id: "GRPC-12"
x-source-part: "Part III.9"
x-source-span: "193-193"
x-verification: "V3 test."
---
# GRPC-12

The request deadline is propagated into `WireContext`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[8. Deadlines, Streaming, and Limits](../../sources/33-grpc/8-deadlines-streaming-and-limits.md)

[^grpc-12]: sources/33-GRPC.md

