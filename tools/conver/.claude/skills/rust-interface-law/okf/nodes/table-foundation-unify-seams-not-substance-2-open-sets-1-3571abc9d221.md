---
type: Table
id: table/foundation-unify-seams-not-substance-2-open-sets/1/3571abc9d221
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 3571abc9d221085e13c30c0debb27f6bbc801b475e36065a2c57c58d5e6317f3
source: sources/00-FOUNDATION.md
---
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
