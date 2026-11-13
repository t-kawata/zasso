---
type: List
id: list/32-cli-adapter-10-conformance-obligations/1/57048ef489a7
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: 57048ef489a7499b3c651cfa8684f568ecf8a9f6de5a626fc14994f2b05499a8
source: sources/32-CLI.md
---
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
