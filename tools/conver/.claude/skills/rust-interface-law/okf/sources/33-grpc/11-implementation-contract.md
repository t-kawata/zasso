---
type: "Section"
title: "11. Implementation Contract"
description: "`tonic = { version = \"=0.14.2\", features = [\"transport\", \"codegen\", \"router\", \"tls-ring\"] }`; `prost = { version = \"=0.14.1\", features = [\"derive\", \"std\"] }`; `tonic-prost = { version = \"=0.14.2\" }`; "
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-11-implementation-contract"
    title: "11. Implementation Contract"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "229-254"
---
## 11. Implementation Contract

### 11.1 Cargo contract

`tonic = { version = "=0.14.2", features = ["transport", "codegen", "router", "tls-ring"] }`; `prost = { version = "=0.14.1", features = ["derive", "std"] }`; `tonic-prost = { version = "=0.14.2" }`; build `tonic-prost-build = { version = "=0.14.2" }`.

### 11.2 Required API sequence

build.rs proto generation -> generated trait implementation -> interceptor metadata auth -> dispatcher unary/stream method -> status mapping -> deadline/cancel propagation.

### 11.3 Forbidden patterns

protobuf types in core or operation contracts, manual HTTP/2, service business logic, whole-stream collect, unredacted status details.

### 11.4 Template

`templates/grpc/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-20 | gRPC services MUST implement generated tonic traits and MUST keep protobuf types outside core and operation contracts. | Generation and boundary. | Message fields. | V2 graph; V3 service test. |
| GRPC-21 | Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method. | Four shapes. | Stream internals. | V3 four-shape tests. |
| GRPC-22 | Non-loopback gRPC exposure MUST use the declared TLS boundary and shared redacted status mapping. | TLS and details. | Certificate source. | V3 TLS/status test. |

## Rules in this section

- [GRPC-20 — gRPC services MUST implement generated tonic traits and MUST keep protobuf ty...](../../rules/c/grpc-20.md)
- [GRPC-21 — Every gRPC streaming shape MUST propagate deadlines, input half-close, and ca...](../../rules/c/grpc-21.md)
- [GRPC-22 — Non-loopback gRPC exposure MUST use the declared TLS boundary and shared reda...](../../rules/c/grpc-22.md)

