---
type: Paragraph
id: paragraph/33-grpc-adapter-11-implementation-contract-11-2-required-api-sequence/1/66c2e0d5971f
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: 66c2e0d5971f21730918ca5ef1f715ee2aa87ef4d9d9996f47f9aa24800b0060
source: sources/33-GRPC.md
---
build.rs proto generation -> generated trait implementation -> interceptor metadata auth -> dispatcher unary/stream method -> status mapping -> deadline/cancel propagation.
