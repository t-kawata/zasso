---
type: Paragraph
id: paragraph/30-rest-adapter-11-implementation-contract-11-1-cargo-contract/1/d3f34d625643
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: d3f34d625643e4ca0a4da554414e0d55cea4f3df82230642dc5446b6e6c0f669
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
`axum = { version = "=0.8.9", features = ["json"] }`; `tower-http = { version = "=0.6.6", features = ["cors", "trace", "request-id"] }`; `utoipa = { version = "=5.4.0", features = ["macros", "axum_extras"] }`; `utoipa-swagger-ui = { version = "=9.0.2", features = ["axum", "vendored"] }`.
