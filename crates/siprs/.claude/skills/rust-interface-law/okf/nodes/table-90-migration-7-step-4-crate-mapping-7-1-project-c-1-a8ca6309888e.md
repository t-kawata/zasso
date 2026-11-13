---
type: Table
id: table/90-migration-7-step-4-crate-mapping-7-1-project-c/1/a8ca6309888e
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: a8ca6309888e211e7d378646860eb738f069edfbc02a68fa7747a1afd6388fa1
source: sources/90-MIGRATION.md
---
| Target role | Existing crate | Action |
|---|---|---|
| core | `<project-c>-core` | Keep; remove transport/auth imports. |
| operation | `<project-c>-operation` | Keep; introduce dispatcher and authorizer. |
| conformance | `<project-c>-conformance` | Keep; add matrix, drivers, negative suite. |
| rest | `<project-c>-rest` | Keep; replace hand routes with generated bindings. |
| websocket | `<project-c>-websocket` | Keep; introduce ticket store and envelope. |
| cli | `<project-c>-cli` | Keep; generate commands from the catalog. |
| grpc | `<project-c>-grpc` | Keep; generate proto from the catalog. |
| mcp | to be created | Add after REST/WS/CLI/gRPC pass. |
| a2a | to be created | Add after MCP. |
| assembly | to be created | Add the wiring crate. |
| build support | `pjsip-prebuilt` | Keep outside the runtime roles; declare as `build-support`. |
