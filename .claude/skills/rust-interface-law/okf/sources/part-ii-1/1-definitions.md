---
type: "Section"
title: "1. Definitions"
description: "| Term | Definition |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/1-definitions"
    title: "1. Definitions"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/1-definitions"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "562-562"
---
## 1. Definitions

| Term | Definition |
|---|---|
| **Operation** | A named business capability with a typed request and response. Example: `account.add`. |
| **OperationId** | A stable dotted identifier for an operation. |
| **Interface** | A transport boundary: REST, WebSocket, CLI, gRPC, MCP, A2A. |
| **Adapter** | The crate that implements one interface and calls operations. |
| **Assembly** | The binary or crate that wires configuration, adapters, operations, and authentication. |
| **SubjectId** | The internal, immutable identifier of an authenticated actor. |
| **VerifiedIdentity** | The only identity value an operation may receive. |
| **Scope** | A named permission. Necessary but never sufficient for authorization. |
| **Audience** | The interface or resource a token is issued for (`aud`). |
| **Conformance** | Executable proof that every interface produces the same operation behavior and authorization result. |
| **Operation catalog** | The project's list of operations, each with its contract and interface bindings. |

---

## 2. Invariants

