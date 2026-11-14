---
type: "Section"
title: "5. Hand-Written Layer"
description: "These are the only places where projects are expected to differ."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/5-hand-written-layer"
    title: "5. Hand-Written Layer"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/5-hand-written-layer"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1235-1235"
---
## 5. Hand-Written Layer

These are the only places where projects are expected to differ.

| Layer | Content |
|---|---|
| `*-core` | Domain types, invariants, value objects, ports. |
| `*-operation` | Operation logic, authorization policy, transactions, compensation, idempotency, event publication. |
| `*-assembly` | Configuration, dependency injection, concrete wiring. |
| `identity-*` | Credential verification, token policy, SSO provider implementation. |
| Extensions | New operations, scopes, error codes, auth methods, interfaces, storage. |

The hand-written layer is where features live. The rules constrain its
boundaries, not its size or content.

---

## 6. Extension Model

