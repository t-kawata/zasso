---
type: "Section"
title: "7.1 <project-c>"
description: "| Target role | Existing crate | Action |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/7-1-project-c"
    title: "7.1 <project-c>"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/7-1-project-c"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6221-6221"
---
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

