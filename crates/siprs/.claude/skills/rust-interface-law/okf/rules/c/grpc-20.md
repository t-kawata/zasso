---
type: "Rule"
title: "GRPC-20 — gRPC services MUST implement generated tonic traits and MUST keep protobuf types outside core and operation contracts."
description: "gRPC services MUST implement generated tonic traits and MUST keep protobuf types outside core and operation contracts."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-20"
    title: "GRPC-20"
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
x-rule-id: "GRPC-20"
x-source-part: "Part III.9"
x-source-span: "251-251"
x-verification: "V2 graph; V3 service test."
---
# GRPC-20

gRPC services MUST implement generated tonic traits and MUST keep protobuf types outside core and operation contracts.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V2 graph; V3 service test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/33-grpc/11-implementation-contract.md)

[^grpc-20]: sources/33-GRPC.md

