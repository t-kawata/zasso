---
type: Table
id: table/90-migration-7-step-4-crate-mapping-7-3-project-b/1/3f2e9e794771
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 3f2e9e794771a32721fa10c9f555244e27448840f65bf8cadfdc206a736b5880
source: docs/archive/IMPLEMENTATION-SPEC/90-MIGRATION.md
---
| Target role | Existing crate | Action |
|---|---|---|
| core | `<project-b>-core`, `<project-b>-protocol-types` | Keep; move invariants into core. |
| operation | `<project-b>-operation`, `<project-b>-protocol-*` | Keep; consolidate operation execution. |
| conformance | `<project-b>-conformance`, `<project-b>-testkit` | Keep; `testkit` supports the harness. |
| assembly | `<project-b>-bootstrap` | Keep; it is the wiring crate. |
| adapters | `<project-b>-adapter-*` | Keep as adapters. |
| transports | `transports/*` | Map to interface crates or external adapters. |
| rest / websocket / cli / grpc / mcp / a2a | to be created | Add the profiles the project selects; recommended order within that set: REST → WebSocket → CLI → gRPC → MCP → A2A. |
