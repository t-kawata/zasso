---
type: Paragraph
id: paragraph/48-implementation-blueprint-mandatory-2-runtime-types/1/f1cc30d324d3
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: f1cc30d324d3b9f6f8c05dc7d0e3088c57e315ab5c1d8116b838a91113ec74f4
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
Numeric rule parameters are stored as string literals in the descriptor so the
descriptor can be a `const`/`static` value. The runtime check uses the parsed
Rust literal directly.
