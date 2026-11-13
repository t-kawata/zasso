---
type: Table
id: table/33-grpc-adapter-9-fixed-and-open/1/e09ab62d64e8
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: e09ab62d64e85e9d1247c1d341f1322486d289006fa161c0368afbbd05da3af4
source: sources/33-GRPC.md
---
| Fixed | Open |
|---|---|
| Crate layout, build script, service generation. | Message fields beyond the fixed envelope. |
| Proto field-number rules and `Context` numbers. | RPC names derived from operation IDs. |
| Metadata Bearer extraction and verification. | Interceptor implementation. |
| Status mapping table. | Error detail payload. |
| Mode mapping and deadline propagation. | Streaming buffer strategy. |
| Generated types do not leak. | Internal conversion helpers. |
