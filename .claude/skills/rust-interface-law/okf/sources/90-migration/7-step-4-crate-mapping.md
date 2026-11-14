---
type: "Section"
title: "7. Step 4 — Crate Mapping"
description: "| Target role | Existing crate | Action |"
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-7-step-4-crate-mapping"
    title: "7. Step 4 — Crate Mapping"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "129-184"
---
## 7. Step 4 — Crate Mapping

### 7.1 <project-c>

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

<project-c> is the pilot because its operation catalog is the most complete.

### 7.2 <project-a>

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

`<project-a>-foundation` must not hold domain rules or transport types. If it does,
move those pieces to `<project-a>-core` or an adapter.

### 7.3 <project-b>

| Target role | Existing crate | Action |
|---|---|---|
| core | `<project-b>-core`, `<project-b>-protocol-types` | Keep; move invariants into core. |
| operation | `<project-b>-operation`, `<project-b>-protocol-*` | Keep; consolidate operation execution. |
| conformance | `<project-b>-conformance`, `<project-b>-testkit` | Keep; `testkit` supports the harness. |
| assembly | `<project-b>-bootstrap` | Keep; it is the wiring crate. |
| adapters | `<project-b>-adapter-*` | Keep as adapters. |
| transports | `transports/*` | Map to interface crates or external adapters. |
| rest / websocket / cli / grpc / mcp / a2a | to be created | Add the profiles the project selects; recommended order within that set: REST → WebSocket → CLI → gRPC → MCP → A2A. |

<project-b> currently has no interface crates. The first interface should be REST,
because it establishes the catalog and conformance matrix. Do not create six
interfaces at once.

---

