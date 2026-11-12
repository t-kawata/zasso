---
type: Table
id: table/33-grpc-adapter-6-authentication/1/f2018fe0641a
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: f2018fe0641ab54077d6b8e5b190791012ee264e03a3356d586ed601b9881a26
source: docs/archive/IMPLEMENTATION-SPEC/33-GRPC.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-06 | Credentials come from gRPC metadata, not from the message body. | Source. | Metadata key. | V3 test. |
| GRPC-07 | Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`. | Mapping. | Detail text. | V3 test. |
| GRPC-08 | The adapter does not construct `VerifiedIdentity`. | Opaque type. | — | V1; V3 compile-fail. |
| GRPC-09 | The interceptor does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |
