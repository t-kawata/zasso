---
type: "Rule"
title: "GRPC-18 — Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelope is not required."
description: "Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelope is not required."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-18"
    title: "GRPC-18"
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
x-rule-id: "GRPC-18"
x-source-part: "Part III.9"
x-source-span: "138-138"
x-verification: "V3 contract test."
---
# GRPC-18

Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelope is not required.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 contract test. |
| Enforcement | conformance driver |

[5. Generated Proto](../../sources/33-grpc/5-generated-proto.md)

[^grpc-18]: sources/33-GRPC.md

