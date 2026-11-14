---
type: "Section"
title: "12.2 Crate mapping"
description: "Each project MUST record how its existing crates map to the roles in §3.1."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/12-2-crate-mapping"
    title: "12.2 Crate mapping"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/12-2-crate-mapping"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "934-934"
---
### 12.2 Crate mapping

Each project MUST record how its existing crates map to the roles in §3.1.
Unmapped crates are a finding, not an exception.

Example:

| Role | <project-a> | <project-b> | <project-c> |
|---|---|---|---|
| core | `<project-a>-core`, `<project-a>-foundation`, `<project-a>-ports` | `<project-b>-core`, `<project-b>-protocol-types` | `<project-c>-core` |
| operation | `<project-a>-operation` | `<project-b>-operation`, `<project-b>-protocol-*` | `<project-c>-operation` |
| conformance | `<project-a>-conformance` | `<project-b>-conformance`, `<project-b>-testkit` | `<project-c>-conformance` |
| rest | `<project-a>-rest` | to be created | `<project-c>-rest` |
| websocket | `<project-a>-websocket` | to be created | `<project-c>-websocket` |
| cli | `<project-a>-cli` | to be created | `<project-c>-cli` |
| grpc | to be created | to be created | `<project-c>-grpc` |
| mcp / a2a | to be created | to be created | to be created |

### 12.3 Application rules

