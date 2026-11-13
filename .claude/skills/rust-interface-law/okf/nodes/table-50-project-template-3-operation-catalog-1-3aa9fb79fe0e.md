---
type: Table
id: table/50-project-template-3-operation-catalog/1/3aa9fb79fe0e
phase: scope
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 3aa9fb79fe0ef8a5989567a9f8d32e5267d72e0f851a2b96d7a7f8524a8b19df
source: sources/50-PROJECT-TEMPLATE.md
---
| Field | Rule |
|---|---|
| `id` | Dotted, stable, unique. Grammar: `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$`. |
| `authentication` | `required` or `anonymous`. |
| `scope` | Required when `authentication = "required"`; MUST be omitted for anonymous. |
| `mode` | `unary`, `server_stream`, `client_stream`, or `bidi`. |
| `request` / `response` / `prepared` | Rust type names. |
| `handler` | Path to the create-once hand-written handler. |
| `conformance` | `CF_<id with dots replaced by underscores>`. |
| `idempotency` | `none`, `same-transaction`, or `external`. |
| `recovery` | Required when the operation has external effects. |
| Interface bindings | Required for every profile in `RULES-PROFILE.toml`; absent profiles are omitted. |
| `mcp` / `a2a` | `applicable = false` requires a reason. |
