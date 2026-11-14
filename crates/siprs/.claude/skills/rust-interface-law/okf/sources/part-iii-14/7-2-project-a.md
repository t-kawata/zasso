---
type: "Section"
title: "7.2 <project-a>"
description: "| Target role | Existing crate | Action |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/7-2-project-a"
    title: "7.2 <project-a>"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/7-2-project-a"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6239-6239"
---
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

