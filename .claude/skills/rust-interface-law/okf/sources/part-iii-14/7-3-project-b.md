---
type: "Section"
title: "7.3 <project-b>"
description: "| Target role | Existing crate | Action |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-14/7-3-project-b"
    title: "7.3 <project-b>"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-14/7-3-project-b"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6257-6257"
---
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

## 8. Step 5 — Dispatcher and Authorization

