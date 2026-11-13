---
type: "Rule"
title: "GRPC-16 — Transport uses TLS outside loopback-only local mode."
description: "Transport uses TLS outside loopback-only local mode."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-16"
    title: "GRPC-16"
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
x-rule-id: "GRPC-16"
x-source-part: "Part III.9"
x-source-span: "197-197"
x-verification: "V2 config check."
---
# GRPC-16

Transport uses TLS outside loopback-only local mode.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V2 config check. |
| Enforcement | conformance driver |

[8. Deadlines, Streaming, and Limits](../../sources/33-grpc/8-deadlines-streaming-and-limits.md)

[^grpc-16]: sources/33-GRPC.md

