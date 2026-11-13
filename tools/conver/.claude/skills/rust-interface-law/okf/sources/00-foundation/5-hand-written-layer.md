---
type: "Section"
title: "5. Hand-Written Layer"
description: "These are the only places where projects are expected to differ."
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-5-hand-written-layer"
    title: "5. Hand-Written Layer"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "113-129"
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

