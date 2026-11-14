---
type: "Section"
title: "2.2 Binding checks"
description: "The dispatcher MUST reject an identity whose binding does not match the"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/2-2-binding-checks"
    title: "2.2 Binding checks"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/2-2-binding-checks"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1648-1648"
---
### 2.2 Binding checks

The dispatcher MUST reject an identity whose binding does not match the
invocation:

```rust
binding.interface() == invocation.interface
binding.audience() == invocation.audience
binding.is_valid_at(now)
```

A verified REST identity cannot be reused with a WebSocket audience. A session
ticket redeemed for WebSocket creates a **new binding** with the WebSocket
interface and the WebSocket audience; the ticket's redemption deadline and the
connection's authentication expiry are separate values.

### 2.3 Delegation

