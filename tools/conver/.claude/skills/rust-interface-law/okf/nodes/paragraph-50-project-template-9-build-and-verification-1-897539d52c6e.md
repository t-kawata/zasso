---
type: Paragraph
id: paragraph/50-project-template-9-build-and-verification/1/897539d52c6e
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 897539d52c6e014508b53154ff2b757a56dcb50f36e237d28c9981218dc6454f
source: docs/archive/IMPLEMENTATION-SPEC/50-PROJECT-TEMPLATE.md
---
The conformance crate is the authoritative gate. `cargo test --workspace` alone
does not prove cross-interface parity, rule coverage, documentation coverage, or
generation determinism. The docgen `--check all` gate covers completeness,
English-only, secret-free, and deterministic output.
