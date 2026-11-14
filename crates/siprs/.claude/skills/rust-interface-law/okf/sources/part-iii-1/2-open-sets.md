---
type: "Section"
title: "2. Open Sets"
description: "These sets are extensible by any project. The rules define only how to add to"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-1/2-open-sets"
    title: "2. Open Sets"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-1/2-open-sets"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "1166-1166"
---
## 2. Open Sets

These sets are extensible by any project. The rules define only how to add to
them, never how large they may be or what they may contain.

| Open set | How it is extended | What must not change |
|---|---|---|
| Operations | Add an entry to the operation catalog; implement `Operation`; bind interfaces; add conformance. | Envelope, context, authorization placement, error categories. |
| Scopes | Declare a new `Scope` value; add it to the authorization policy. | Scope is still necessary but not sufficient; operation-layer authorization. |
| Error codes | Add a new `ErrorCode`; map it to an existing protocol category. | The protocol category table and the `OperationError` shape. |
| Auth methods | Implement `CredentialVerifier`; call the existing `TokenIssuer`. | Token validation, audience rules, identity type. |
| SSO providers | Implement the `SsoProvider` trait in `identity-sso`. | Login flow contract, external identity storage, internal token issuance. |
| Interfaces | Implement `InterfaceDriver`; add a profile; extend the conformance matrix. | Adapter responsibilities, operation invocation, no cross-interface calls. |
| Streaming modes | Declare `U`/`S`/`C`/`B` per operation; implement the matching driver. | Envelope, cancellation, EOF, error semantics. |
| Storage backends | Implement the core ports (`Repository`, `UnitOfWork`, `Outbox`, `EventRelay`). | Core and operation contracts. |
| Domain models | Add types inside `*-core`. | Ports and invariants. |
| Performance strategies | Change internals behind ports. | Observable behavior and conformance results. |
| Crate roles | Declare an additional role (`tooling`, `test-support`, `build-support`, `utility`) in `RULES-PROFILE.toml` with its allowed dependency edges. | Dependency direction and forbidden edges. |
| Resource identifiers | Use any stable encoding (UUID, content hash, composite key) behind `ResourceId`. | Uniqueness and authorization semantics. |
| Aggregate state | Use a state enum only for aggregates with a lifecycle. | Invariant enforcement. |
| Internal layout | Choose hand-written module internals freely. | Public module layout and generated-file boundaries. |

---

## 3. Closed Seams

