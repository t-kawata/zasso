---
type: "Rule"
title: "GRPC-22 — Non-loopback gRPC exposure MUST use the declared TLS boundary and shared redacted status mapping."
description: "Non-loopback gRPC exposure MUST use the declared TLS boundary and shared redacted status mapping."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-22"
    title: "GRPC-22"
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
x-rule-id: "GRPC-22"
x-source-part: "Part III.9"
x-source-span: "253-253"
x-verification: "V3 TLS/status test."
---
# GRPC-22

Non-loopback gRPC exposure MUST use the declared TLS boundary and shared redacted status mapping.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 TLS/status test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/33-grpc/11-implementation-contract.md)

[^grpc-22]: sources/33-GRPC.md

