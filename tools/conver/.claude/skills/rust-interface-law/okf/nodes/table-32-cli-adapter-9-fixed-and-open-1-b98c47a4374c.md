---
type: Table
id: table/32-cli-adapter-9-fixed-and-open/1/b98c47a4374c
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: b98c47a4374c6c9f188ae77642ab90fd4e72b9f37f0ddc619fcdd69bc87d065d
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
| Fixed | Open |
|---|---|
| Crate layout, `run` entry point, mode selection. | Argument names, help text, output formatting. |
| Generated one-to-one command mapping. | Composition commands with documentation. |
| Local/remote distinction and explicit principal. | Local credential backend. |
| Exit code table and output channels. | Human-readable presentation. |
| Secret sources and argv rejection. | Token cache and refresh strategy. |
| No cross-interface crate dependency. | Direct protocol client implementation. |
