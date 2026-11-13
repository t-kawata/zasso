---
type: "Section"
title: "6. Required Files by Profile"
description: "| File | Required when |"
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "50-project-template-6-required-files-by-profile"
    title: "6. Required Files by Profile"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/50-PROJECT-TEMPLATE.md"
x-source-span: "263-287"
---
## 6. Required Files by Profile

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

A profile that is `false` must not require its files. A project that implements
only MCP must not be required to add REST, WebSocket, CLI, or gRPC.

---

