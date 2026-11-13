---
type: CodeBlock
id: codeblock/33-grpc-adapter-6-authentication/1/6fd1ac32cf24
phase: adapter
delivery: must
applies_to: grpc
requires: []
references: []
content_sha256: 6fd1ac32cf240115e4dc7bcf209e212f9eef43d3a3b1d2649a2c915d9795a62a
source: sources/33-GRPC.md
---
```text
read `authorization` metadata
  → require Bearer
  → verifier.verify(token, audience)
  → insert Arc<VerifiedIdentity> into request extensions
  → dispatch
```
