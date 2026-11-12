---
type: Table
id: table/50-project-template-6-required-files-by-profile/1/96c524229bea
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 96c524229bea492e01f29d511a5b35b4151a25e7e6e75ed9fe149165acc404af
source: docs/archive/IMPLEMENTATION-SPEC/50-PROJECT-TEMPLATE.md
---
| File | Required when |
|---|---|
| `RULES-PROFILE.toml` | Always. |
| `SYSTEM-DESIGN.md` | Always. |
| `contract/operation-catalog.toml` | Always. |
| `contract/proto-field-ledger.toml` | `grpc = true`. |
| `proto/<project>.v1.proto` | `grpc = true`. |
| `crates/<project>-docgen/` | Always. |
| `docs/generated/INDEX.md` | Always. |
| `docs/generated/rest/` | `rest = true`. |
| `docs/generated/websocket/` | `websocket = true`. |
| `docs/generated/cli/` | `cli = true`. |
| `docs/generated/grpc/` | `grpc = true`. |
| `docs/generated/mcp/` | `mcp = true`. |
| `docs/generated/a2a/` | `a2a = true`. |
| `<project>-conformance/src/matrix/generated.rs` | Always. |
| `<project>-conformance/src/cases/generated.rs` | Always. |
