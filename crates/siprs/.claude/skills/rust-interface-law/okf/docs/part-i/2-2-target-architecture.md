---
type: "Documentation"
title: "2.2 Target architecture"
description: "New development is organized as Rust Cargo workspaces with crate-level roles:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/2-2-target-architecture"
    title: "2.2 Target architecture"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/2-2-target-architecture"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "49-49"
---
### 2.2 Target architecture

New development is organized as Rust Cargo workspaces with crate-level roles:

```text
<project>-core          domain model, invariants, ports
<project>-operation     operation handlers, authorization, transactions,
                        compensation, idempotency, events
<project>-conformance   operation oracles, cross-interface tests, rule gates
<project>-rest          HTTP adapter
<project>-websocket     WebSocket adapter
<project>-cli           CLI adapter
<project>-grpc          gRPC adapter
<project>-mcp           MCP adapter
<project>-a2a           A2A adapter
```

Shared foundation crates carry identity, contracts, and the conformance harness:

```text
identity-core / identity-jwt / identity-local / identity-operation / identity-sso
operation-contract / interface-contract
```

All interfaces call the same operation implementation. Interfaces are thin
adapters: they extract credentials, convert input, call the shared verifier,
invoke the operation dispatcher, convert output, and map errors.

### 2.3 Authentication goal

