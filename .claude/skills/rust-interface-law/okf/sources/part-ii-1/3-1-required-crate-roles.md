---
type: "Section"
title: "3.1 Required crate roles"
description: "| Crate pattern | Role |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/3-1-required-crate-roles"
    title: "3.1 Required crate roles"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/3-1-required-crate-roles"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "599-599"
---
### 3.1 Required crate roles

| Crate pattern | Role |
|---|---|
| `*-core` | Domain model, invariants, value objects, and ports (traits). |
| `*-operation` | Operation handlers, authorization, transactions, compensation, idempotency, event publication. |
| `*-conformance` | Operation oracles, cross-interface tests, negative tests, rule gates. |
| `*-rest` | HTTP input/output, credential extraction, operation invocation, HTTP error mapping. |
| `*-websocket` | WebSocket upgrade, connection auth state, message envelope, backpressure. |
| `*-cli` | Argument parsing, credential acquisition, operation invocation, output formatting. |
| `*-grpc` | Protobuf generation, metadata auth, operation invocation, gRPC status mapping. |
| `*-mcp` | MCP protocol handling, tool/resource mapping, operation invocation. |
| `*-a2a` | A2A protocol handling, task/message mapping, operation invocation. |
| `identity-core` | Subject identity, `VerifiedIdentity`, scopes, authentication and authorization contracts. |
| `identity-jwt` | JWT issuance and verification, key resolution. |
| `identity-local` | Initial login method (for example password credentials). |
| `identity-operation` | Login orchestration: credential result → subject resolution → token issuance. |
| `identity-sso` | Optional OIDC/SSO adapter. |
| `*-assembly` or the binary | Configuration, dependency injection, router/service composition. |
| `*-adapter-*` | External-system adapters (payment, identity proofing, transport). |

The table is a minimum role set, not a closed list. A project MAY add
`tooling`, `test-support`, `build-support`, or `utility` crates. It declares
their dependency edges in `RULES-PROFILE.toml`; the forbidden edges in ARC-02
through ARC-08 still apply. A test or benchmark crate is never a reason to
violate a runtime dependency rule.

### 3.2 Rules

