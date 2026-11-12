---
type: Table
id: table/30-rest-adapter-9-fixed-and-open/1/3bfafad9014e
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: 3bfafad9014e35a38a8889b8f253224a97b0558d2c4777e9a554ed8b767a4245
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
| Fixed | Open |
|---|---|
| Crate layout, state, router split, middleware placement. | Middleware internals, extractor helpers. |
| Bearer-only authentication. | Token acquisition flow. |
| Status and error category tables. | Error codes within categories. |
| Idempotency header name and wire context. | Idempotency store implementation. |
| Pagination parameter names. | Page size limits and filters. |
| OpenAPI generation obligation. | Descriptions, examples, tags. |
| Aliases delegate to operations. | Alias paths. |
