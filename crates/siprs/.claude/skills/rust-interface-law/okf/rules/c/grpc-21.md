---
type: "Rule"
title: "GRPC-21 — Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method."
description: "Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-21"
    title: "GRPC-21"
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
x-rule-id: "GRPC-21"
x-source-part: "Part III.9"
x-source-span: "252-252"
x-verification: "V3 four-shape tests."
---
# GRPC-21

Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 four-shape tests. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/33-grpc/11-implementation-contract.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [GRPC-20 — gRPC services MUST implement generated tonic traits and MUST keep protobuf ty...](grpc-20.md)
- [GRPC-22 — Non-loopback gRPC exposure MUST use the declared TLS boundary and shared reda...](grpc-22.md)

[^grpc-21]: sources/33-GRPC.md

