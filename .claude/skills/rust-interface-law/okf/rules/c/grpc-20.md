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

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [GRPC-21 — Every gRPC streaming shape MUST propagate deadlines, input half-close, and ca...](grpc-21.md)
- [GRPC-22 — Non-loopback gRPC exposure MUST use the declared TLS boundary and shared reda...](grpc-22.md)

[^grpc-20]: sources/33-GRPC.md

