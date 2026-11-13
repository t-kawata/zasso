---
type: Table
id: table/90-migration-7-step-4-crate-mapping-7-2-project-a/1/a69662bebeec
phase: review
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: a69662bebeec19b1bcd6cb33ab093cc351b4a0d1414f182bf614d9d3fb39312d
source: sources/90-MIGRATION.md
---
| Target role | Existing crate | Action |
|---|---|---|
| core | `<project-a>-core`, `<project-a>-foundation`, `<project-a>-ports` | Split: `<project-a>-core` = domain; `<project-a>-ports` = ports; `<project-a>-foundation` = pure utilities. Declare `foundation` as a utility, not a domain crate. |
| operation | `<project-a>-operation` | Keep; add dispatcher and authorizer. |
| conformance | `<project-a>-conformance` | Keep; add matrix and drivers. |
| rest | `<project-a>-rest` | Keep; generate routes. |
| websocket | `<project-a>-websocket` | Keep; add ticket store. |
| cli | `<project-a>-cli` | Keep; generate commands. |
| grpc | to be created | Add after the existing interfaces pass. |
| mcp / a2a | to be created | Add last. |
| adapters | `<project-a>-*-adapter` | Keep as adapters; no domain logic. |
| assembly | to be created | Add the wiring crate. |
