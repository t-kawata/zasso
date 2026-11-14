---
type: "Section"
title: "5.7 Pipeline"
description: "The dispatcher and the operation share this fixed partial order:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/5-7-pipeline"
    title: "5.7 Pipeline"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/5-7-pipeline"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2305-2305"
---
### 5.7 Pipeline

The dispatcher and the operation share this fixed partial order:

```text
1. decode and size check                     dispatcher
2. authenticate (or establish anonymity)     dispatcher
3. authentication requirement check          dispatcher
4. scope check                               dispatcher
5. deadline and admission                    dispatcher
6. generated input validation                 dispatcher/operation
7. idempotency claim                          dispatcher
8a. replay branch: replay_authorize the
    recorded target; return stored result     operation
8b. acquired branch: prepare (schema/domain
    validation, resource load, tenant/
    ownership authorization)                  operation
9. execute: reservation, mutation,
   commit, outbox enqueue                     operation
10. result store / reply                      dispatcher
```

No business side effect may occur before authorization succeeds.

- **Validation (6):** runs for both replay and new requests, before the claim.
  It is stateless input validation; state-dependent preconditions, resource
  loading, and ownership authorization stay in `prepare`.
- **Replay branch (8a):** the dispatcher returns the stored result after
  `replay_authorize` confirms the current caller may access the recorded
  target. `prepare` is not run; delete, create, and approve operations must not
  fail their own retry because their first success changed the state.
- **Acquired branch (8b):** `prepare` validates and authorizes before
  `execute`. No side effect occurs before it succeeds.

For create operations with no existing resource, `prepare` authorizes against
the tenant or a declared global target:

```rust
pub enum AuthorizationTarget {
    Resource(std::sync::Arc<dyn ResourceRef>),
    Tenant(TenantId),
    Global,
}

#[derive(Clone)]
pub struct AuthorizationTargetSnapshot {
    pub action: Action,
    pub resource_id: Option<ResourceId>,
    pub tenant: Option<TenantId>,
    pub owner: Option<SubjectId>,
}

#[derive(Clone)]
pub struct ReplayRecord {
    pub request_id: RequestId,
    pub operation: OperationId,
    pub request_hash: [u8; 32],
    pub target: AuthorizationTargetSnapshot,
    pub result: OperationResultBody,
}
```

### 5.8 Errors

