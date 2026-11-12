---
type: Paragraph
id: paragraph/45-documentation-generation-1-purpose/2/70b744b837fb
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 70b744b837fba65401f7e0c2bcf9d7005e4709dcc1b5bb6548f4f1a41dc8c034
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
The generator does not parse Rust source code. It consumes a neutral schema
registry, the operation catalog, the interface bindings, the validation
descriptor registry, and the shared contracts. `utoipa`/OpenAPI is one schema
source and one REST output; it is not the only input and it is not required for
non-REST interfaces.
