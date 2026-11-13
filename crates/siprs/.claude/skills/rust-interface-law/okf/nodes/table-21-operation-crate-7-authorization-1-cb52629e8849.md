---
type: Table
id: table/21-operation-crate-7-authorization/1/cb52629e8849
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: cb52629e8849ed7cf371ef7f0b8be264f7c5365b25d089c1377e5a732707f3d5
source: sources/21-OPERATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-AUTH-01 | Scope is checked by the dispatcher; ownership/tenant by the authorizer. | Both. | Policy. | V3 test. |
| OP-AUTH-02 | The authorizer uses the loaded resource, never request IDs alone. | Resource target. | Policy. | V3 cross-tenant test. |
| OP-AUTH-03 | Cross-tenant target returns `not_found`; own target with insufficient rights returns `permission_denied`. | Categories. | Detail. | V3 test. |
| OP-AUTH-04 | Replay is authorized through `replay_authorize` against the recorded target, not through full `prepare`. | Replay path. | — | V3 test. |
| OP-AUTH-05 | The same identity and resource produce the same result through every interface. | Invariant. | — | V3 conformance. |
