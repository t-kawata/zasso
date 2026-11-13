---
type: Paragraph
id: paragraph/33-grpc-adapter-1-purpose/1/a4f97f9b96e3
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: a4f97f9b96e3770054c6f97726b4c6a2842e5c17081b75b78f3bded6fa357255
source: sources/33-GRPC.md
---
`*-grpc` is a thin gRPC adapter. It generates the protobuf service from the
operation catalog, extracts metadata credentials, verifies them, converts
protobuf messages to operation requests, calls the dispatcher, and maps the
result and errors to gRPC statuses. Generated protobuf types never leave this
crate.
