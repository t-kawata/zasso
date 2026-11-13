---
type: Paragraph
id: paragraph/33-grpc-adapter-11-implementation-contract-11-1-cargo-contract/1/996d7f17c745
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: 996d7f17c7454e3829064f31b8a929fbea2f07dad64188831423977a3932cdc3
source: sources/33-GRPC.md
---
`tonic = { version = "=0.14.2", features = ["transport", "codegen", "router", "tls-ring"] }`; `prost = { version = "=0.14.1", features = ["derive", "std"] }`; `tonic-prost = { version = "=0.14.2" }`; build `tonic-prost-build = { version = "=0.14.2" }`.
