---
type: Table
id: table/33-grpc-adapter-11-implementation-contract-11-5-rules/1/efe6e272b2b6
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: efe6e272b2b65ce6747c2c4173d614ad575379516eb64a83d505d5a2309704e4
source: docs/archive/IMPLEMENTATION-SPEC/33-GRPC.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-20 | gRPC services MUST implement generated tonic traits and MUST keep protobuf types outside core and operation contracts. | Generation and boundary. | Message fields. | V2 graph; V3 service test. |
| GRPC-21 | Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method. | Four shapes. | Stream internals. | V3 four-shape tests. |
| GRPC-22 | Non-loopback gRPC exposure MUST use the declared TLS boundary and shared redacted status mapping. | TLS and details. | Certificate source. | V3 TLS/status test. |
