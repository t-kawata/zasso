---
type: Table
id: table/20-core-crate-5-domain-model-rules/1/8cb2de3ae56d
phase: core
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 8cb2de3ae56dc8ded0546541feb87c10a255089a95765ca4aecac873418fc240
source: sources/20-CORE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CORE-01 | Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt. | Root and state are explicit when a lifecycle exists. | Fields, variants, and behavior. | V1 types; V4 review. |
| CORE-02 | Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`. | Transition returns a result. | Transition table. | V1; V3 transition tests. |
| CORE-03 | Value objects validate on construction. | Constructors return `Result`. | Validation rules. | V3 test. |
| CORE-04 | IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries. | Newtype per aggregate. | Underlying representation. | V1. |
| CORE-05 | Time is injected through `Clock`; `Utc::now()` is forbidden in core. | Port use. | Clock implementation. | V2 scan; V3 test. |
| CORE-06 | Randomness and ID allocation go through `IdGenerator`. | Port use. | Generator implementation. | V2 scan; V3 test. |
| CORE-07 | Domain errors are typed and carry a stable code. | `DomainError` shape. | Code set. | V1; V3 test. |
| CORE-08 | Core does not perform I/O. | No I/O imports. | — | V2 import scan. |
| CORE-09 | Core does not serialize wire envelopes or know protocol status codes. | No transport types. | Serde derives on domain values are allowed. | V2 scan. |
| CORE-10 | Domain events are values; publication happens outside core. | Event type shape. | Event set. | V1; V3 test. |
