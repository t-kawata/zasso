---
type: Table
id: table/21-operation-crate-5-handler-protocol/1/4f5aea73bc82
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 4f5aea73bc82ee8bafec28afb8fb06fcb936d2969bcd80f0ba03d23f55393698
source: sources/21-OPERATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-01 | Exactly one handler per operation ID. | One registration. | Handler body. | V3 registry test. |
| OP-02 | `prepare` performs validation and authorization; it has no business side effect. | Split. | Validation and policy. | V3 failure-injection test. |
| OP-03 | `execute` performs reservation, mutation, commit, and outbox enqueue. | Order. | Transaction strategy. | V3 event-order test. |
| OP-04 | Repositories are obtained from the unit of work. | UoW ownership. | Concrete repository surface. | V2 scan; V3 test. |
| OP-05 | The handler never constructs `AuthenticatedContext` or `VerifiedIdentity`. | Opaque types. | — | V1; V3 compile-fail. |
| OP-06 | The handler does not branch on `InterfaceId`. | Forbidden. | — | V2 scan; V4 review. |
| OP-07 | A handler that cannot complete uses the declared recovery policy. | Recovery declared. | Compensate / forward / isolate. | V3 failure-injection test. |
| OP-08 | Generated skeletons carry a create-once marker and are not overwritten. | Marker. | Handler body. | V2 check. |
