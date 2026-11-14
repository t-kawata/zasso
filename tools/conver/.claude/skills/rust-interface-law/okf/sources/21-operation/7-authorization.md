---
type: "Section"
title: "7. Authorization"
description: "```rust"
sources: 
  - resource: "sources/21-OPERATION.md"
    id: "21-operation-7-authorization"
    title: "7. Authorization"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/21-OPERATION.md"
x-source-span: "244-270"
---
## 7. Authorization

```rust
pub trait Authorizer: Send + Sync {
    fn require(
        &self,
        identity: &VerifiedIdentity,
        action: Action,
        target: &AuthorizationTarget,
    ) -> Result<(), AuthorizationError>;
}
```

`AuthorizationTarget` is `Resource`, `Tenant`, or `Global`. `prepare` loads the
resource and passes it to the authorizer. For create operations, the target is
the tenant or global; there is no fabricated resource.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-AUTH-01 | Scope is checked by the dispatcher; ownership/tenant by the authorizer. | Both. | Policy. | V3 test. |
| OP-AUTH-02 | The authorizer uses the loaded resource, never request IDs alone. | Resource target. | Policy. | V3 cross-tenant test. |
| OP-AUTH-03 | Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`. | Categories. | Detail. | V3 test. |
| OP-AUTH-04 | Replay is authorized through `replay_authorize` against the recorded target, not through full `prepare`. | Replay path. | — | V3 test. |
| OP-AUTH-05 | The same identity and resource produce the same result through every interface. | Invariant. | — | V3 conformance. |

---

