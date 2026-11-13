---
type: "Section"
title: "10. Conformance Obligations"
description: "1. Every catalog operation has a subcommand."
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-10-conformance-obligations"
    title: "10. Conformance Obligations"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "240-253"
---
## 10. Conformance Obligations

1. Every catalog operation has a subcommand.
2. Local mode rejects a missing or invalid principal.
3. Remote mode rejects a token in argv.
4. Exit codes match the table for every error category.
5. stdout contains no diagnostics; stderr contains no data.
6. JSON/JSONL output matches the operation response schema.
7. No secret appears in output, logs, or errors.
8. No cross-interface crate dependency.
9. `cargo test -p <project>-cli` and `cargo clippy -p <project>-cli -- -D
   warnings`.
10. The conformance report names `CLI-01` through `CLI-14`.

